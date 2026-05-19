import json
import traceback
import asyncio
from functools import partial
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from models.schemas import CropTrackSchema, ManualTrackRequest
from models.config import AspectRatio
from models.db_models import ReframeTrack, Video
from services.reframe import detect_subjects, generate_crop_track
from database import get_db
from auth import get_current_user, CurrentUser

import os

router = APIRouter(prefix="/api/reframe", tags=["reframe"])

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "./storage"))
DATA_DIR = STORAGE_DIR / "data"
CLIPS_DIR = STORAGE_DIR / "clips"


def _find_clip_file(video_id: str, clip_index: int) -> str | None:
    clip_filename = f"{video_id}_clip_{clip_index}.mp4"
    clip_path = CLIPS_DIR / clip_filename
    return str(clip_path) if clip_path.exists() else None


# ── Detect subjects in a clip ──

@router.get("/{video_id}/clips/{clip_index}/subjects")
async def get_subjects(
    video_id: str,
    clip_index: int,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Detect subjects in a clip for the user to select which to track."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(404, "Video not found")

    clip_path = _find_clip_file(video_id, clip_index)
    if not clip_path:
        raise HTTPException(404, "Clip not found")

    try:
        loop = asyncio.get_event_loop()
        subjects = await loop.run_in_executor(
            None, partial(detect_subjects, clip_path)
        )
        return {"subjects": subjects}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Subject detection failed: {str(e)}")


# ── Auto-track: generate crop track following a subject ──

@router.post("/{video_id}/clips/{clip_index}/auto-track")
async def auto_track(
    video_id: str,
    clip_index: int,
    target_aspect: AspectRatio = AspectRatio.PORTRAIT_9_16,
    subject_id: int | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a crop track by auto-tracking a subject."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(404, "Video not found")

    clip_path = _find_clip_file(video_id, clip_index)
    if not clip_path:
        raise HTTPException(404, "Clip not found")

    try:
        loop = asyncio.get_event_loop()
        track = await loop.run_in_executor(
            None,
            partial(generate_crop_track,
                    video_path=clip_path,
                    target_aspect=target_aspect,
                    subject_id=subject_id),
        )
        # Save to DB
        _save_track(db, video_id, clip_index, track)
        # Also save to JSON file
        _save_track_file(video_id, clip_index, track)

        return track
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Auto-tracking failed: {str(e)}")


# ── Manual track: user-drawn bounding box anchors ──

@router.post("/{video_id}/clips/{clip_index}/manual-track")
async def manual_track(
    video_id: str,
    clip_index: int,
    request: ManualTrackRequest,
    target_aspect: AspectRatio = AspectRatio.PORTRAIT_9_16,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a crop track from manual anchor points."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(404, "Video not found")

    clip_path = _find_clip_file(video_id, clip_index)
    if not clip_path:
        raise HTTPException(404, "Clip not found")

    if not request.anchors:
        raise HTTPException(400, "At least one anchor point is required")

    try:
        anchors_dicts = [a.model_dump() for a in request.anchors]
        loop = asyncio.get_event_loop()
        track = await loop.run_in_executor(
            None,
            partial(generate_crop_track,
                    video_path=clip_path,
                    target_aspect=target_aspect,
                    anchors=anchors_dicts),
        )
        _save_track(db, video_id, clip_index, track)
        _save_track_file(video_id, clip_index, track)

        return track
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Manual tracking failed: {str(e)}")


# ── Get saved crop track ──

@router.get("/{video_id}/clips/{clip_index}/track")
async def get_track(
    video_id: str,
    clip_index: int,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the saved crop track for a clip."""
    # Try DB first
    row = db.query(ReframeTrack).filter(
        ReframeTrack.video_id == video_id,
        ReframeTrack.clip_index == clip_index,
    ).first()
    if row:
        return row.track_json

    # Fallback to file
    track_file = DATA_DIR / f"{video_id}_clip_{clip_index}_track.json"
    if track_file.exists():
        return json.loads(track_file.read_text())

    raise HTTPException(404, "No crop track found for this clip")


# ── Save/update crop track (manual keyframe edits) ──

@router.put("/{video_id}/clips/{clip_index}/track")
async def save_track(
    video_id: str,
    clip_index: int,
    track: CropTrackSchema,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save or update a crop track (e.g., after manual keyframe adjustments)."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(404, "Video not found")

    track_dict = track.model_dump()
    _save_track(db, video_id, clip_index, track_dict)
    _save_track_file(video_id, clip_index, track_dict)

    return {"status": "saved"}


# ── Transcript endpoint (for editor panel) ──

@router.get("/{video_id}/transcript")
async def get_transcript_for_editor(
    video_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get transcript data for the editor's synced transcript panel."""
    from models.db_models import Transcript
    t = db.query(Transcript).filter(Transcript.video_id == video_id).first()
    if t:
        return {"text": t.text, "segments": t.segments_json, "words": t.words_json}

    # Fallback to file
    transcript_file = DATA_DIR / f"{video_id}_transcript.json"
    if transcript_file.exists():
        return json.loads(transcript_file.read_text())

    raise HTTPException(404, "Transcript not found")


# ── Helpers ──

def _save_track(db: Session, video_id: str, clip_index: int, track_dict: dict):
    """Save crop track to database (upsert)."""
    existing = db.query(ReframeTrack).filter(
        ReframeTrack.video_id == video_id,
        ReframeTrack.clip_index == clip_index,
    ).first()

    if existing:
        existing.track_json = track_dict
    else:
        row = ReframeTrack(
            video_id=video_id,
            clip_index=clip_index,
            track_json=track_dict,
        )
        db.add(row)
    db.commit()


def _save_track_file(video_id: str, clip_index: int, track_dict: dict):
    """Save crop track to JSON file (fallback storage)."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    track_file = DATA_DIR / f"{video_id}_clip_{clip_index}_track.json"
    track_file.write_text(json.dumps(track_dict, indent=2), encoding="utf-8")
