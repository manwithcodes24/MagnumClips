import json
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from celery_app import celery_app
from services.video_processor import extract_audio, trim_video, generate_thumbnail
from services.transcription import transcribe_audio
from services.transcription_gemini import transcribe_audio_gemini
from services.transcription_local import transcribe_audio_local
from services.clip_detector import detect_best_clips


def _get_storage_dirs():
    import os
    storage = Path(os.getenv("STORAGE_DIR", "./storage"))
    return {
        "raw": storage / "raw",
        "clips": storage / "clips",
        "audio": storage / "audio",
        "thumbnails": storage / "thumbnails",
        "data": storage / "data",
    }


def _find_raw_file(raw_dir: Path, video_id: str) -> str | None:
    if not raw_dir.exists():
        return None
    for f in raw_dir.iterdir():
        if f.stem == video_id:
            return str(f)
    return None


@celery_app.task(bind=True, max_retries=2, default_retry_delay=30)
def run_analysis_pipeline(self, video_id: str, config_dict: dict):
    """Run the full analysis pipeline as a Celery task."""
    dirs = _get_storage_dirs()
    raw_file = _find_raw_file(dirs["raw"], video_id)
    if not raw_file:
        raise ValueError(f"Video {video_id} not found")

    try:
        # 1. Extract audio
        self.update_state(state="PROGRESS", meta={"stage": "Extracting audio..."})
        dirs["audio"].mkdir(parents=True, exist_ok=True)
        audio_path = str(dirs["audio"] / f"{video_id}.mp3")
        extract_audio(raw_file, audio_path, fmt="mp3")

        # 2. Transcribe
        self.update_state(state="PROGRESS", meta={"stage": "Transcribing audio..."})
        provider = config_dict.get("transcription_provider", "local")
        gemini_model = config_dict.get("gemini_model", "gemini-3-flash-preview")

        if provider == "local":
            transcript = transcribe_audio_local(audio_path)
        elif provider == "gemini":
            transcript = transcribe_audio_gemini(audio_path, model_name=gemini_model)
        else:
            transcript = transcribe_audio(audio_path)

        dirs["data"].mkdir(parents=True, exist_ok=True)
        with open(dirs["data"] / f"{video_id}_transcript.json", "w") as f:
            json.dump(transcript, f, indent=2)

        # 3. Detect clips
        self.update_state(state="PROGRESS", meta={"stage": "Analyzing transcript with AI..."})
        num_clips = config_dict.get("num_clips", 3)
        target_duration = config_dict.get("target_clip_duration", 60)
        clips = detect_best_clips(
            transcript=transcript,
            num_clips=num_clips,
            target_duration=target_duration,
            model_name=gemini_model,
        )

        # 4. Extract clips in parallel
        self.update_state(state="PROGRESS", meta={"stage": "Trimming clips..."})
        dirs["clips"].mkdir(parents=True, exist_ok=True)
        dirs["thumbnails"].mkdir(parents=True, exist_ok=True)

        def extract_clip(clip):
            clip_filename = f"{video_id}_clip_{clip['index']}.mp4"
            clip_path = str(dirs["clips"] / clip_filename)
            thumb_filename = f"{video_id}_clip_{clip['index']}.jpg"
            thumb_path = str(dirs["thumbnails"] / thumb_filename)
            trim_video(raw_file, clip_path, clip["start_time"], clip["end_time"])
            generate_thumbnail(clip_path, thumb_path)
            return {
                "index": clip["index"],
                "start_time": clip["start_time"],
                "end_time": clip["end_time"],
                "duration": clip["duration"],
                "title": clip["title"],
                "reason": clip["reason"],
                "engagement_score": clip["engagement_score"],
                "thumbnail_url": f"/api/files/thumbnails/{thumb_filename}",
                "clip_url": f"/api/files/clips/{clip_filename}",
            }

        clip_results = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(extract_clip, clip): clip for clip in clips}
            for future in futures:
                try:
                    clip_results.append(future.result())
                except Exception as e:
                    clip = futures[future]
                    print(f"Warning: Failed to extract clip {clip['index']}: {e}")

        clip_results.sort(key=lambda c: c["index"])

        with open(dirs["data"] / f"{video_id}_clips.json", "w") as f:
            json.dump(clip_results, f, indent=2)

        return {"status": "done", "stage": "Complete", "clips_count": len(clip_results)}

    except Exception as e:
        traceback.print_exc()
        raise self.retry(exc=e) if self.request.retries < self.max_retries else e
