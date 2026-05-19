import json
import traceback
from pathlib import Path
from celery_app import celery_app
from services.video_processor import export_final, burn_text_overlays
from services.caption_generator import generate_ass_subtitles
from services.reframe import apply_reframe


def _get_storage_dirs():
    import os
    storage = Path(os.getenv("STORAGE_DIR", "./storage"))
    return {
        "clips": storage / "clips",
        "exports": storage / "exports",
        "captions": storage / "captions",
        "data": storage / "data",
    }


@celery_app.task(bind=True, max_retries=1, default_retry_delay=10)
def run_export(self, video_id: str, clip_index: int, edits_dict: dict, config_dict: dict):
    """Run video export as a Celery task."""
    dirs = _get_storage_dirs()
    dirs["exports"].mkdir(parents=True, exist_ok=True)
    dirs["captions"].mkdir(parents=True, exist_ok=True)

    clip_filename = f"{video_id}_clip_{clip_index}.mp4"
    clip_path = dirs["clips"] / clip_filename
    if not clip_path.exists():
        raise FileNotFoundError(f"Clip not found: {clip_filename}")

    try:
        subtitle_path = None

        # Generate captions if enabled
        self.update_state(state="PROGRESS", meta={"stage": "Generating captions..."})
        if config_dict.get("captions_enabled", False):
            transcript_file = dirs["data"] / f"{video_id}_transcript.json"
            transcript = None
            if transcript_file.exists():
                transcript = json.loads(transcript_file.read_text())

            if transcript:
                clips_file = dirs["data"] / f"{video_id}_clips.json"
                clip_start = 0
                clip_end = None
                if clips_file.exists():
                    clips_data = json.loads(clips_file.read_text())
                    for cd in clips_data:
                        if cd["index"] == clip_index:
                            clip_start = cd["start_time"]
                            clip_end = cd["end_time"]
                            break

                # Determine caption resolution based on reframe target
                caption_w, caption_h = 1920, 1080
                if config_dict.get("reframe_enabled", False):
                    track_file_cap = dirs["data"] / f"{video_id}_clip_{clip_index}_track.json"
                    if track_file_cap.exists():
                        track_data = json.loads(track_file_cap.read_text())
                        caption_w = track_data.get("target_width", 1080)
                        caption_h = track_data.get("target_height", 1920)

                ass_content = generate_ass_subtitles(
                    words=transcript.get("words", []),
                    segments=transcript.get("segments", []),
                    font=config_dict.get("caption_font", "bold"),
                    position=config_dict.get("caption_position", "bottom"),
                    style=config_dict.get("caption_style", "word_by_word"),
                    trim_start=clip_start,
                    trim_end=clip_end,
                    target_width=caption_w,
                    target_height=caption_h,
                )
                sub_file = dirs["captions"] / f"{video_id}_clip_{clip_index}.ass"
                sub_file.write_text(ass_content, encoding="utf-8")
                subtitle_path = str(sub_file)

        # Prepare text overlays, split by follow_reframe
        all_overlays = edits_dict.get("text_overlays") or []
        reframe_enabled = config_dict.get("reframe_enabled", False)
        pre_reframe_overlays = [ov for ov in all_overlays if ov.get("follow_reframe", False)] if reframe_enabled else []
        post_reframe_overlays = [ov for ov in all_overlays if not ov.get("follow_reframe", False)] if reframe_enabled else all_overlays

        # Burn follow_reframe text into source BEFORE reframing
        reframe_source = str(clip_path)
        if pre_reframe_overlays:
            self.update_state(state="PROGRESS", meta={"stage": "Burning text overlays..."})
            # Load crop track for coordinate mapping
            track_file_txt = dirs["data"] / f"{video_id}_clip_{clip_index}_track.json"
            txt_crop_track = None
            if track_file_txt.exists():
                txt_crop_track = json.loads(track_file_txt.read_text())
            pretxt_filename = f"{video_id}_clip_{clip_index}_pretxt.mp4"
            pretxt_path = str(dirs["clips"] / pretxt_filename)
            burn_text_overlays(
                input_path=str(clip_path),
                output_path=pretxt_path,
                text_overlays=pre_reframe_overlays,
                trim_start=edits_dict.get("trim_start"),
                crop_track=txt_crop_track,
            )
            reframe_source = pretxt_path

        # Reframe if enabled
        reframed_path = None
        if reframe_enabled:
            self.update_state(state="PROGRESS", meta={"stage": "Reframing video..."})
            track_file = dirs["data"] / f"{video_id}_clip_{clip_index}_track.json"
            crop_track = None
            if track_file.exists():
                crop_track = json.loads(track_file.read_text())

            if crop_track:
                reframed_filename = f"{video_id}_clip_{clip_index}_reframed.mp4"
                reframed_path = str(dirs["clips"] / reframed_filename)
                apply_reframe(
                    input_path=reframe_source,
                    output_path=reframed_path,
                    crop_track=crop_track,
                )

        # Use reframed clip if available, otherwise original
        source_path = reframed_path if reframed_path else reframe_source

        # Export
        self.update_state(state="PROGRESS", meta={"stage": "Encoding video..."})
        export_filename = f"{video_id}_clip_{clip_index}_final.mp4"
        export_path = str(dirs["exports"] / export_filename)

        color_preset = config_dict.get("color_grade_preset") if config_dict.get("color_grade_enabled") else None

        export_final(
            filepath=source_path,
            output_path=export_path,
            trim_start=edits_dict.get("trim_start"),
            trim_end=edits_dict.get("trim_end"),
            text_overlays=post_reframe_overlays or None,
            subtitle_path=subtitle_path,
            color_preset=color_preset,
        )

        return {
            "status": "done",
            "stage": "Complete",
            "download_url": f"/api/files/exports/{export_filename}",
        }

    except Exception as e:
        traceback.print_exc()
        raise
