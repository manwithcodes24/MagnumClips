import os
import json
import uuid
import shutil
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from models.schemas import YouTubeRequest, VideoInfo
from models.db_models import Video, Job, Clip, Transcript
from services.youtube import download_youtube_video, validate_youtube_url
from services.video_processor import get_video_info, generate_thumbnail
from database import get_db
from auth import get_current_user, CurrentUser
from routers.subscription import check_usage_limit, record_usage

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "./storage"))
RAW_DIR = STORAGE_DIR / "raw"
THUMBNAILS_DIR = STORAGE_DIR / "thumbnails"
DATA_DIR = STORAGE_DIR / "data"


def _save_video_meta(video_info: VideoInfo, source: str, source_url: str | None = None,
                     db: Session | None = None, user_id: str | None = None):
    """Persist video metadata to DB and disk."""
    # Save to DB
    if db:
        video = Video(
            id=video_info.id,
            user_id=user_id,
            filename=video_info.filename,
            duration=video_info.duration,
            width=video_info.width,
            height=video_info.height,
            source=source,
            source_url=source_url,
            thumbnail_url=video_info.thumbnail_url,
        )
        db.add(video)
        db.commit()

    # Also persist to disk for backward compat
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    meta = video_info.model_dump()
    meta["source"] = source
    meta["source_url"] = source_url
    meta["created_at"] = datetime.now(timezone.utc).isoformat()
    with open(DATA_DIR / f"{video_info.id}_meta.json", "w") as f:
        json.dump(meta, f, indent=2)


@router.post("/youtube", response_model=VideoInfo)
async def ingest_youtube(req: YouTubeRequest, db: Session = Depends(get_db),
                         current_user: CurrentUser = Depends(get_current_user)):
    """Download a YouTube video and return its metadata."""
    check_usage_limit(current_user.id, "ingest", db, user=current_user)
    if not validate_youtube_url(req.url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    video_id = uuid.uuid4().hex[:12]
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        filepath = download_youtube_video(req.url, str(RAW_DIR), video_id)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    info = get_video_info(filepath)

    # Generate thumbnail
    thumb_path = str(THUMBNAILS_DIR / f"{video_id}.jpg")
    try:
        generate_thumbnail(filepath, thumb_path)
    except Exception:
        thumb_path = None

    result = VideoInfo(
        id=video_id,
        filename=os.path.basename(filepath),
        duration=info["duration"],
        width=info["width"],
        height=info["height"],
        thumbnail_url=f"/api/files/thumbnails/{video_id}.jpg" if thumb_path else None,
    )
    _save_video_meta(result, source="youtube", source_url=req.url, db=db, user_id=current_user.id)
    record_usage(current_user.id, "ingest", video_id, db)
    return result


@router.post("/upload", response_model=VideoInfo)
async def ingest_upload(file: UploadFile = File(...), db: Session = Depends(get_db),
                        current_user: CurrentUser = Depends(get_current_user)):
    """Upload an MP4 file and return its metadata."""
    check_usage_limit(current_user.id, "ingest", db, user=current_user)
    if not file.filename or not file.filename.lower().endswith((".mp4", ".mov", ".mkv", ".webm")):
        raise HTTPException(status_code=400, detail="Only video files (mp4, mov, mkv, webm) are accepted")

    video_id = uuid.uuid4().hex[:12]
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix.lower()
    filepath = str(RAW_DIR / f"{video_id}{ext}")

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    info = get_video_info(filepath)

    thumb_path = str(THUMBNAILS_DIR / f"{video_id}.jpg")
    try:
        generate_thumbnail(filepath, thumb_path)
    except Exception:
        thumb_path = None

    result = VideoInfo(
        id=video_id,
        filename=f"{video_id}{ext}",
        duration=info["duration"],
        width=info["width"],
        height=info["height"],
        thumbnail_url=f"/api/files/thumbnails/{video_id}.jpg" if thumb_path else None,
    )
    _save_video_meta(result, source="upload", source_url=None, db=db, user_id=current_user.id)
    record_usage(current_user.id, "ingest", video_id, db)
    return result


@router.get("/history")
async def list_videos(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """List all previously ingested videos for the current user, newest first."""
    videos = db.query(Video).filter(Video.user_id == current_user.id).order_by(Video.created_at.desc()).all()
    if videos:
        results = []
        for v in videos:
            # Verify the raw file still exists
            raw_exists = any(RAW_DIR.glob(f"{v.id}.*")) if RAW_DIR.exists() else False
            if raw_exists:
                results.append({
                    "id": v.id,
                    "filename": v.filename,
                    "duration": v.duration,
                    "width": v.width,
                    "height": v.height,
                    "source": v.source,
                    "source_url": v.source_url,
                    "thumbnail_url": v.thumbnail_url,
                    "created_at": v.created_at.isoformat() if v.created_at else None,
                })
        return results

    # Fallback: read from JSON files (backward compat for pre-DB data)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    results = []
    for meta_file in DATA_DIR.glob("*_meta.json"):
        try:
            data = json.loads(meta_file.read_text())
            raw_exists = any(RAW_DIR.glob(f"{data['id']}.*"))
            if raw_exists:
                results.append(data)
        except Exception:
            continue
    results.sort(key=lambda v: v.get("created_at", ""), reverse=True)
    return results


@router.delete("/history/{video_id}")
async def delete_video(video_id: str, db: Session = Depends(get_db),
                       current_user: CurrentUser = Depends(get_current_user)):
    """Delete a video and all its associated files."""
    # Delete from DB (cascade deletes jobs, clips, transcript)
    video = db.query(Video).filter(Video.id == video_id, Video.user_id == current_user.id).first()
    if video:
        db.delete(video)
        db.commit()

    deleted = []
    # Remove raw video
    for f in RAW_DIR.glob(f"{video_id}.*"):
        f.unlink()
        deleted.append(str(f))
    # Remove thumbnail
    for f in THUMBNAILS_DIR.glob(f"{video_id}*"):
        f.unlink()
        deleted.append(str(f))
    # Remove data files (meta, config, transcript)
    for f in DATA_DIR.glob(f"{video_id}_*"):
        f.unlink()
        deleted.append(str(f))
    # Remove clips
    clips_dir = STORAGE_DIR / "clips"
    if clips_dir.exists():
        for f in clips_dir.glob(f"{video_id}_*"):
            f.unlink()
            deleted.append(str(f))
    # Remove audio
    audio_dir = STORAGE_DIR / "audio"
    if audio_dir.exists():
        for f in audio_dir.glob(f"{video_id}.*"):
            f.unlink()
            deleted.append(str(f))
    # Remove exports
    exports_dir = STORAGE_DIR / "exports"
    if exports_dir.exists():
        for f in exports_dir.glob(f"{video_id}_*"):
            f.unlink()
            deleted.append(str(f))

    if not deleted and not video:
        raise HTTPException(status_code=404, detail="Video not found")

    return {"status": "ok", "deleted": len(deleted)}
