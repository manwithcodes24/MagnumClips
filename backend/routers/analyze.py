import os
import json
import asyncio
import threading
import traceback
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request, Depends
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse
from models.schemas import AnalyzeResponse, ClipResult
from models.config import VideoConfig
from models.db_models import Job, Clip as ClipModel, Transcript
from services.video_processor import extract_audio, trim_video, generate_thumbnail
from services.transcription import transcribe_audio
from services.transcription_gemini import transcribe_audio_gemini
from services.transcription_local import transcribe_audio_local
from services.clip_detector import detect_best_clips
from database import get_db, SessionLocal
from auth import get_current_user, CurrentUser

router = APIRouter(prefix="/api/video", tags=["analyze"])

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "./storage"))
RAW_DIR = STORAGE_DIR / "raw"
CLIPS_DIR = STORAGE_DIR / "clips"
AUDIO_DIR = STORAGE_DIR / "audio"
THUMBNAILS_DIR = STORAGE_DIR / "thumbnails"
DATA_DIR = STORAGE_DIR / "data"

# In-memory config cache (lightweight, loaded from disk/DB on demand)
_configs: dict[str, VideoConfig] = {}


def _find_raw_file(video_id: str) -> str | None:
    """Find the raw video file for a given video ID."""
    if not RAW_DIR.exists():
        return None
    for f in RAW_DIR.iterdir():
        if f.stem == video_id:
            return str(f)
    return None


def get_transcript(video_id: str) -> dict | None:
    """Get stored transcript for a video."""
    # Try DB first
    db = SessionLocal()
    try:
        t = db.query(Transcript).filter(Transcript.video_id == video_id).first()
        if t:
            return {"text": t.text, "segments": t.segments_json, "words": t.words_json}
    finally:
        db.close()
    # Fallback to file
    transcript_file = DATA_DIR / f"{video_id}_transcript.json"
    if transcript_file.exists():
        return json.loads(transcript_file.read_text())
    return None


def get_config(video_id: str) -> VideoConfig | None:
    """Get stored config for a video."""
    return _configs.get(video_id)


# --- Static routes MUST be defined before parameterized /{video_id} routes ---

@router.get("/jobs/active", tags=["jobs"])
async def list_active_jobs(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """List all active/recent analysis jobs with video metadata."""
    jobs = db.query(Job).filter(Job.job_type == "analyze").order_by(Job.started_at.desc()).limit(50).all()
    results = []
    for job in jobs:
        meta = None
        meta_file = DATA_DIR / f"{job.video_id}_meta.json"
        if meta_file.exists():
            meta = json.loads(meta_file.read_text())
        results.append({
            "video_id": job.video_id,
            "status": job.status,
            "stage": job.stage,
            "error": job.error,
            "video": meta,
        })
    return results


@router.get("/history/completed")
async def list_completed_videos():
    """List all videos that have completed analysis with their clips."""
    results = []
    if not DATA_DIR.exists():
        return results
    for clips_file in sorted(DATA_DIR.glob("*_clips.json"), key=lambda f: f.stat().st_mtime, reverse=True):
        video_id = clips_file.stem.replace("_clips", "")
        meta_file = DATA_DIR / f"{video_id}_meta.json"
        meta = None
        if meta_file.exists():
            meta = json.loads(meta_file.read_text())
        clips_data = json.loads(clips_file.read_text())
        results.append({
            "video_id": video_id,
            "video": meta,
            "clips": clips_data,
        })
    return results


# --- Parameterized routes ---

@router.post("/{video_id}/config")
async def save_config(video_id: str, config: VideoConfig, current_user: CurrentUser = Depends(get_current_user)):
    """Save configuration for a video job."""
    raw_file = _find_raw_file(video_id)
    if not raw_file:
        raise HTTPException(status_code=404, detail="Video not found")
    _configs[video_id] = config

    # Also persist to disk
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(DATA_DIR / f"{video_id}_config.json", "w") as f:
        f.write(config.model_dump_json(indent=2))

    return {"status": "ok", "video_id": video_id}


@router.get("/{video_id}/config", response_model=VideoConfig)
async def load_config(video_id: str, current_user: CurrentUser = Depends(get_current_user)):
    """Load configuration for a video job."""
    if video_id in _configs:
        return _configs[video_id]

    config_file = DATA_DIR / f"{video_id}_config.json"
    if config_file.exists():
        data = json.loads(config_file.read_text())
        config = VideoConfig(**data)
        _configs[video_id] = config
        return config

    return VideoConfig()  # defaults


@router.post("/{video_id}/analyze")
async def analyze_video(video_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """Start the AI analysis pipeline in the background. Returns immediately."""
    raw_file = _find_raw_file(video_id)
    if not raw_file:
        raise HTTPException(status_code=404, detail="Video not found")

    # If already running, return current status from DB
    existing_job = db.query(Job).filter(
        Job.video_id == video_id, Job.job_type == "analyze", Job.status == "running"
    ).first()
    if existing_job:
        return {"status": existing_job.status, "stage": existing_job.stage, "error": existing_job.error}

    config = _configs.get(video_id, VideoConfig())

    # Create job row in DB
    job = Job(video_id=video_id, job_type="analyze", status="running", stage="Starting...",
              config_json=config.model_dump())
    db.add(job)
    db.commit()
    job_id = job.id

    def run_pipeline():
        session = SessionLocal()
        try:
            db_job = session.query(Job).filter(Job.id == job_id).first()

            # 1. Extract audio
            db_job.stage = "Extracting audio..."
            session.commit()
            AUDIO_DIR.mkdir(parents=True, exist_ok=True)
            audio_path = str(AUDIO_DIR / f"{video_id}.mp3")
            extract_audio(raw_file, audio_path, fmt="mp3")

            # 2. Transcribe
            db_job.stage = "Transcribing audio..."
            session.commit()
            if config.transcription_provider.value == "local":
                transcript = transcribe_audio_local(audio_path)
            elif config.transcription_provider.value == "gemini":
                transcript = transcribe_audio_gemini(audio_path, model_name=config.gemini_model.value)
            else:
                transcript = transcribe_audio(audio_path)

            # Save transcript to DB
            existing_t = session.query(Transcript).filter(Transcript.video_id == video_id).first()
            if existing_t:
                existing_t.text = transcript.get("text", "")
                existing_t.segments_json = transcript.get("segments", [])
                existing_t.words_json = transcript.get("words", [])
            else:
                session.add(Transcript(
                    video_id=video_id,
                    text=transcript.get("text", ""),
                    segments_json=transcript.get("segments", []),
                    words_json=transcript.get("words", []),
                ))
            session.commit()

            # Also save to disk for backward compat
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            with open(DATA_DIR / f"{video_id}_transcript.json", "w") as f:
                json.dump(transcript, f, indent=2)

            # 3. Detect clips
            db_job.stage = "Analyzing transcript with AI..."
            session.commit()
            clips = detect_best_clips(
                transcript=transcript,
                num_clips=config.num_clips,
                target_duration=config.target_clip_duration,
                model_name=config.gemini_model.value,
            )

            # 4. Extract clip segments (parallel)
            db_job.stage = "Trimming clips..."
            session.commit()
            CLIPS_DIR.mkdir(parents=True, exist_ok=True)
            THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

            def extract_clip(clip):
                clip_filename = f"{video_id}_clip_{clip['index']}.mp4"
                clip_path = str(CLIPS_DIR / clip_filename)
                thumb_filename = f"{video_id}_clip_{clip['index']}.jpg"
                thumb_path = str(THUMBNAILS_DIR / thumb_filename)
                trim_video(raw_file, clip_path, clip["start_time"], clip["end_time"])
                generate_thumbnail(clip_path, thumb_path)
                return ClipResult(
                    index=clip["index"],
                    start_time=clip["start_time"],
                    end_time=clip["end_time"],
                    duration=clip["duration"],
                    title=clip["title"],
                    reason=clip["reason"],
                    engagement_score=clip["engagement_score"],
                    thumbnail_url=f"/api/files/thumbnails/{thumb_filename}",
                    clip_url=f"/api/files/clips/{clip_filename}",
                )

            clip_results = []
            with ThreadPoolExecutor(max_workers=4) as pool:
                futures = {pool.submit(extract_clip, clip): clip for clip in clips}
                for future in futures:
                    try:
                        clip_results.append(future.result())
                    except Exception as e:
                        clip = futures[future]
                        print(f"Warning: Failed to extract clip {clip['index']}: {e}")

            clip_results.sort(key=lambda c: c.index)

            # Save clips to DB
            session.query(ClipModel).filter(ClipModel.video_id == video_id).delete()
            for cr in clip_results:
                session.add(ClipModel(
                    video_id=video_id, index=cr.index,
                    start_time=cr.start_time, end_time=cr.end_time, duration=cr.duration,
                    title=cr.title, reason=cr.reason, engagement_score=cr.engagement_score,
                    thumbnail_url=cr.thumbnail_url, clip_url=cr.clip_url,
                ))

            # Also save to disk
            with open(DATA_DIR / f"{video_id}_clips.json", "w") as f:
                json.dump([c.model_dump() for c in clip_results], f, indent=2)

            db_job.status = "done"
            db_job.stage = "Complete"
            db_job.finished_at = datetime.now(timezone.utc)
            session.commit()

        except Exception as e:
            traceback.print_exc()
            session.rollback()
            db_job = session.query(Job).filter(Job.id == job_id).first()
            if db_job:
                db_job.status = "error"
                db_job.error = str(e)
                db_job.finished_at = datetime.now(timezone.utc)
                session.commit()
        finally:
            session.close()

    thread = threading.Thread(target=run_pipeline, daemon=True)
    thread.start()

    return {"status": "running", "stage": "Starting...", "error": None}


@router.get("/{video_id}/analyze/status")
async def analyze_status(video_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """Poll the status of a running analysis job."""
    job = db.query(Job).filter(
        Job.video_id == video_id, Job.job_type == "analyze"
    ).order_by(Job.started_at.desc()).first()
    if job:
        return {"status": job.status, "stage": job.stage, "error": job.error}
    # Check if clips already exist on disk (backward compat)
    clips_file = DATA_DIR / f"{video_id}_clips.json"
    if clips_file.exists():
        return {"status": "done", "stage": "Complete", "error": None}
    return {"status": "not_started", "stage": None, "error": None}


@router.get("/{video_id}/analyze/stream")
async def analyze_stream(video_id: str, request: Request):
    """Stream analysis status updates via Server-Sent Events."""
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break

            session = SessionLocal()
            try:
                job = session.query(Job).filter(
                    Job.video_id == video_id, Job.job_type == "analyze"
                ).order_by(Job.started_at.desc()).first()
                if job:
                    data = json.dumps({"status": job.status, "stage": job.stage, "error": job.error})
                    yield {"data": data}
                    if job.status in ("done", "error"):
                        break
                else:
                    clips_file = DATA_DIR / f"{video_id}_clips.json"
                    if clips_file.exists():
                        data = json.dumps({"status": "done", "stage": "Complete", "error": None})
                        yield {"data": data}
                        break
                    else:
                        data = json.dumps({"status": "not_started", "stage": None, "error": None})
                        yield {"data": data}
            finally:
                session.close()

            await asyncio.sleep(1)

    return EventSourceResponse(event_generator())


@router.get("/{video_id}/clips", response_model=list[ClipResult])
async def get_clips(video_id: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """Get previously detected clips for a video."""
    # Try DB first
    clips = db.query(ClipModel).filter(ClipModel.video_id == video_id).order_by(ClipModel.index).all()
    if clips:
        return [ClipResult(
            index=c.index, start_time=c.start_time, end_time=c.end_time,
            duration=c.duration, title=c.title, reason=c.reason,
            engagement_score=c.engagement_score, thumbnail_url=c.thumbnail_url,
            clip_url=c.clip_url,
        ) for c in clips]
    # Fallback to file
    clips_file = DATA_DIR / f"{video_id}_clips.json"
    if clips_file.exists():
        data = json.loads(clips_file.read_text())
        return [ClipResult(**c) for c in data]
    raise HTTPException(status_code=404, detail="No clips found. Run analysis first.")
