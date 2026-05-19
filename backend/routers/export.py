import os
import json
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from models.schemas import ExportRequest
from models.config import VideoConfig
from models.db_models import Job
from services.video_processor import export_final, burn_text_overlays
from services.caption_generator import generate_ass_subtitles
from services.reframe import apply_reframe
from routers.analyze import get_transcript, get_config, _find_raw_file, DATA_DIR
from database import get_db, SessionLocal
from auth import get_current_user, CurrentUser
from routers.subscription import check_usage_limit, record_usage

router = APIRouter(prefix="/api/video", tags=["export"])

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "./storage"))
CLIPS_DIR = STORAGE_DIR / "clips"
EXPORTS_DIR = STORAGE_DIR / "exports"
CAPTIONS_DIR = STORAGE_DIR / "captions"


@router.get("/{video_id}/export/status")
async def export_status(video_id: str, clip_index: int = 0, db: Session = Depends(get_db),
                       current_user: CurrentUser = Depends(get_current_user)):
    """Poll the status of a running export job."""
    job = db.query(Job).filter(
        Job.video_id == video_id, Job.job_type == "export", Job.clip_index == clip_index
    ).order_by(Job.started_at.desc()).first()
    if job:
        return {"status": job.status, "stage": job.stage, "progress": job.progress,
                "eta_seconds": job.eta_seconds, "error": job.error, "download_url": job.download_url}
    return {"status": "not_started", "stage": None, "progress": None, "eta_seconds": None,
            "error": None, "download_url": None}


@router.post("/{video_id}/export")
async def export_video(video_id: str, req: ExportRequest, db: Session = Depends(get_db),
                      current_user: CurrentUser = Depends(get_current_user)):
    """Export a finalized clip with all edits, captions, and color grading. Returns immediately."""
    check_usage_limit(current_user.id, "export", db, user=current_user)
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    CAPTIONS_DIR.mkdir(parents=True, exist_ok=True)

    # Find the source clip
    clip_filename = f"{video_id}_clip_{req.clip_index}.mp4"
    clip_path = CLIPS_DIR / clip_filename
    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")

    # If already running, return current status
    existing_job = db.query(Job).filter(
        Job.video_id == video_id, Job.job_type == "export",
        Job.clip_index == req.clip_index, Job.status == "running"
    ).first()
    if existing_job:
        return {"status": existing_job.status, "stage": existing_job.stage,
                "error": existing_job.error, "download_url": existing_job.download_url}

    # Create job row in DB
    job = Job(video_id=video_id, job_type="export", status="running",
              stage="Starting export...", clip_index=req.clip_index)
    db.add(job)
    db.commit()
    job_id = job.id
    record_usage(current_user.id, "export", video_id, db)

    # Capture request data for the background thread
    clip_index = req.clip_index
    edits = req.edits
    config = req.config

    def run_export():
        session = SessionLocal()
        try:
            db_job = session.query(Job).filter(Job.id == job_id).first()
            subtitle_path = None

            # Determine which steps will run to compute weighted progress
            has_pre_text = False
            has_reframe = config.reframe_enabled
            # We always have a final encode step
            # Weights: pre_text=15%, reframe=30%, final=55% (adjusted if steps are skipped)

            def _make_progress_cb(stage_name: str, stage_start: float, stage_weight: float):
                """Create a callback that maps a 0-100 sub-progress to an overall %."""
                def cb(pct: float, eta: int | None):
                    overall = stage_start + (pct / 100) * stage_weight
                    db_job.stage = stage_name
                    db_job.progress = round(min(overall, 99.0), 1)
                    db_job.eta_seconds = eta
                    session.commit()
                return cb

            # Generate captions if enabled
            db_job.stage = "Generating captions..."
            db_job.progress = 0
            session.commit()
            if config.captions_enabled:
                transcript = get_transcript(video_id)
                if not transcript:
                    transcript_file = DATA_DIR / f"{video_id}_transcript.json"
                    if transcript_file.exists():
                        transcript = json.loads(transcript_file.read_text())

                if transcript:
                    clips_file = DATA_DIR / f"{video_id}_clips.json"
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
                    if config.reframe_enabled:
                        track_file_cap = DATA_DIR / f"{video_id}_clip_{clip_index}_track.json"
                        if track_file_cap.exists():
                            track_data = json.loads(track_file_cap.read_text())
                            caption_w = track_data.get("target_width", 1080)
                            caption_h = track_data.get("target_height", 1920)

                    ass_content = generate_ass_subtitles(
                        words=transcript.get("words", []),
                        segments=transcript.get("segments", []),
                        font=config.caption_font,
                        position=config.caption_position,
                        style=config.caption_style,
                        trim_start=clip_start,
                        trim_end=clip_end,
                        target_width=caption_w,
                        target_height=caption_h,
                    )
                    sub_file = CAPTIONS_DIR / f"{video_id}_clip_{clip_index}.ass"
                    sub_file.write_text(ass_content, encoding="utf-8")
                    subtitle_path = str(sub_file)

            # Prepare text overlays, split by follow_reframe
            all_overlays = [ov.model_dump() for ov in edits.text_overlays] if edits.text_overlays else []
            pre_reframe_overlays = [ov for ov in all_overlays if ov.get("follow_reframe", False)] if config.reframe_enabled else []
            post_reframe_overlays = [ov for ov in all_overlays if not ov.get("follow_reframe", False)] if config.reframe_enabled else all_overlays

            # Burn follow_reframe text into source BEFORE reframing
            reframe_source = str(clip_path)
            if pre_reframe_overlays:
                has_pre_text = True
                db_job.stage = "Burning text overlays..."
                db_job.progress = 5
                session.commit()
                # Load crop track for coordinate mapping
                track_file_txt = DATA_DIR / f"{video_id}_clip_{clip_index}_track.json"
                txt_crop_track = None
                if track_file_txt.exists():
                    txt_crop_track = json.loads(track_file_txt.read_text())
                pretxt_filename = f"{video_id}_clip_{clip_index}_pretxt.mp4"
                pretxt_path = str(CLIPS_DIR / pretxt_filename)
                burn_text_overlays(
                    input_path=str(clip_path),
                    output_path=pretxt_path,
                    text_overlays=pre_reframe_overlays,
                    trim_start=edits.trim_start,
                    crop_track=txt_crop_track,
                )
                reframe_source = pretxt_path

            # Compute progress weights based on active steps
            # Steps: pre_text (0-15%), reframe (15-45%), final (45-100%)
            # If steps are skipped, redistribute weight to final
            pre_text_start = 5.0
            pre_text_weight = 10.0 if has_pre_text else 0.0
            reframe_start = pre_text_start + pre_text_weight
            reframe_weight = 30.0 if has_reframe else 0.0
            final_start = reframe_start + reframe_weight
            final_weight = 95.0 - final_start  # remaining up to 95%

            # Reframe if enabled
            reframed_path = None
            if config.reframe_enabled:
                db_job.stage = "Reframing video..."
                db_job.progress = reframe_start
                session.commit()
                track_file = DATA_DIR / f"{video_id}_clip_{clip_index}_track.json"
                if track_file.exists():
                    crop_track = json.loads(track_file.read_text())
                    reframed_filename = f"{video_id}_clip_{clip_index}_reframed.mp4"
                    reframed_path = str(CLIPS_DIR / reframed_filename)
                    apply_reframe(
                        input_path=reframe_source,
                        output_path=reframed_path,
                        crop_track=crop_track,
                        on_progress=_make_progress_cb("Reframing video...", reframe_start, reframe_weight),
                    )

            # Use reframed clip if available, otherwise original
            source_path = reframed_path if reframed_path else reframe_source

            # Export
            db_job.stage = "Encoding video..."
            db_job.progress = final_start
            session.commit()

            export_filename = f"{video_id}_clip_{clip_index}_final.mp4"
            export_path = str(EXPORTS_DIR / export_filename)

            export_final(
                filepath=source_path,
                output_path=export_path,
                trim_start=edits.trim_start,
                trim_end=edits.trim_end,
                text_overlays=post_reframe_overlays or None,
                subtitle_path=subtitle_path,
                color_preset=config.color_grade_preset.value if config.color_grade_enabled else None,
                on_progress=_make_progress_cb("Encoding video...", final_start, final_weight),
            )

            db_job.status = "done"
            db_job.stage = "Complete"
            db_job.progress = 100
            db_job.eta_seconds = 0
            db_job.download_url = f"/api/files/exports/{export_filename}"
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

    thread = threading.Thread(target=run_export, daemon=True)
    thread.start()

    return {"status": "running", "stage": "Starting export...", "error": None, "download_url": None}
