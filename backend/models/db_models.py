import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Integer, Text, DateTime, ForeignKey, JSON, Index, Boolean
from sqlalchemy.orm import relationship
from database import Base


def _gen_id():
    return uuid.uuid4().hex[:12]


# ── Subscription Plans (adjustable from DB / admin) ──

class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(50), unique=True, nullable=False)          # free, pro, enterprise
    max_videos_per_month = Column(Integer, nullable=False, default=5)
    max_exports_per_month = Column(Integer, nullable=False, default=10)
    max_video_duration_seconds = Column(Integer, nullable=False, default=600)  # 10 min
    max_storage_mb = Column(Integer, nullable=False, default=500)
    price_monthly = Column(Float, nullable=False, default=0.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    subscriptions = relationship("UserSubscription", back_populates="plan")


class UserSubscription(Base):
    __tablename__ = "user_subscriptions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=False)                    # Supabase auth.users UUID
    plan_id = Column(String(36), ForeignKey("subscription_plans.id"), nullable=False)
    status = Column(String(20), nullable=False, default="active")   # active, cancelled, expired
    current_period_start = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    current_period_end = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    plan = relationship("SubscriptionPlan", back_populates="subscriptions")

    __table_args__ = (
        Index("ix_user_subscriptions_user_id", "user_id"),
    )


class UsageRecord(Base):
    __tablename__ = "usage_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=False)                    # Supabase auth.users UUID
    action = Column(String(20), nullable=False)                     # ingest, analyze, export
    video_id = Column(String(12), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_usage_records_user_id", "user_id"),
        Index("ix_usage_records_user_action", "user_id", "action"),
    )


# ── Video & related models ──

class Video(Base):
    __tablename__ = "videos"

    id = Column(String(12), primary_key=True, default=_gen_id)
    user_id = Column(String(36), nullable=True, index=True)         # Supabase auth.users UUID
    filename = Column(String(255), nullable=False)
    duration = Column(Float, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    source = Column(String(20), nullable=False)
    source_url = Column(Text, nullable=True)
    thumbnail_url = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    jobs = relationship("Job", back_populates="video", cascade="all, delete-orphan")
    clips = relationship("Clip", back_populates="video", cascade="all, delete-orphan")
    transcript = relationship("Transcript", back_populates="video", uselist=False, cascade="all, delete-orphan")
    reframe_tracks = relationship("ReframeTrack", back_populates="video", cascade="all, delete-orphan")
    explainer_projects = relationship("ExplainerProject", back_populates="video")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id = Column(String(12), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    job_type = Column(String(20), nullable=False)  # "analyze" or "export"
    status = Column(String(20), nullable=False, default="running")  # running, done, error
    stage = Column(Text, nullable=True)
    progress = Column(Float, nullable=True)       # 0-100 real encoding progress
    eta_seconds = Column(Integer, nullable=True)   # estimated seconds remaining
    error = Column(Text, nullable=True)
    celery_task_id = Column(String(36), nullable=True)
    config_json = Column(JSON, nullable=True)
    # For export jobs
    clip_index = Column(Integer, nullable=True)
    download_url = Column(Text, nullable=True)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime, nullable=True)

    # Relationships
    video = relationship("Video", back_populates="jobs")

    __table_args__ = (
        Index("ix_jobs_video_id_type", "video_id", "job_type"),
    )


class Clip(Base):
    __tablename__ = "clips"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id = Column(String(12), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    index = Column(Integer, nullable=False)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    duration = Column(Float, nullable=False)
    title = Column(Text, nullable=False)
    reason = Column(Text, nullable=False)
    engagement_score = Column(Float, nullable=False)
    thumbnail_url = Column(Text, nullable=True)
    clip_url = Column(Text, nullable=True)

    # Relationships
    video = relationship("Video", back_populates="clips")

    __table_args__ = (
        Index("ix_clips_video_id", "video_id"),
    )


class Transcript(Base):
    __tablename__ = "transcripts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id = Column(String(12), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, unique=True)
    text = Column(Text, nullable=False)
    segments_json = Column(JSON, nullable=False)
    words_json = Column(JSON, nullable=False)

    # Relationships
    video = relationship("Video", back_populates="transcript")


class ReframeTrack(Base):
    __tablename__ = "reframe_tracks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id = Column(String(12), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    clip_index = Column(Integer, nullable=False)
    track_json = Column(JSON, nullable=False)   # CropTrackSchema dict
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    video = relationship("Video", back_populates="reframe_tracks")

    __table_args__ = (
        Index("ix_reframe_tracks_video_clip", "video_id", "clip_index", unique=True),
    )


# --- Explainer generator models ---

class ExplainerProject(Base):
    __tablename__ = "explainer_projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=False, index=True)
    input_type = Column(String(20), nullable=False)  # prompt, youtube, upload, existing_video
    video_id = Column(String(12), ForeignKey("videos.id", ondelete="SET NULL"), nullable=True)
    source_url = Column(Text, nullable=True)
    prompt = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="draft")  # draft, planning, ready, rendering, done, error
    config_json = Column(JSON, nullable=False, default=dict)
    theme_json = Column(JSON, nullable=False, default=dict)
    script_plan_json = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    video = relationship("Video", back_populates="explainer_projects")
    clips = relationship("ExplainerClip", back_populates="project", cascade="all, delete-orphan")
    jobs = relationship("ExplainerJob", back_populates="project", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_explainer_projects_user_created", "user_id", "created_at"),
    )


class ExplainerClip(Base):
    __tablename__ = "explainer_clips"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("explainer_projects.id", ondelete="CASCADE"), nullable=False)
    index = Column(Integer, nullable=False)
    title = Column(Text, nullable=False)
    topic = Column(Text, nullable=True)
    narration = Column(Text, nullable=True)
    duration = Column(Float, nullable=True)
    status = Column(String(20), nullable=False, default="draft")  # draft, rendering, done, error
    scene_plan_json = Column(JSON, nullable=False, default=dict)
    rendered_url = Column(Text, nullable=True)
    thumbnail_url = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("ExplainerProject", back_populates="clips")
    scenes = relationship("ExplainerScene", back_populates="clip", cascade="all, delete-orphan")
    edits = relationship("ExplainerEdit", back_populates="clip", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_explainer_clips_project_index", "project_id", "index", unique=True),
    )


class ExplainerScene(Base):
    __tablename__ = "explainer_scenes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clip_id = Column(String(36), ForeignKey("explainer_clips.id", ondelete="CASCADE"), nullable=False)
    index = Column(Integer, nullable=False)
    start_time = Column(Float, nullable=False, default=0)
    end_time = Column(Float, nullable=False, default=0)
    narration = Column(Text, nullable=True)
    on_screen_text = Column(Text, nullable=True)
    visual_spec_json = Column(JSON, nullable=False, default=dict)
    assets_json = Column(JSON, nullable=False, default=list)
    style_overrides_json = Column(JSON, nullable=False, default=dict)

    clip = relationship("ExplainerClip", back_populates="scenes")

    __table_args__ = (
        Index("ix_explainer_scenes_clip_index", "clip_id", "index", unique=True),
    )


class ExplainerEdit(Base):
    __tablename__ = "explainer_edits"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    clip_id = Column(String(36), ForeignKey("explainer_clips.id", ondelete="CASCADE"), nullable=False)
    selection_json = Column(JSON, nullable=False)
    prompt = Column(Text, nullable=False)
    scope = Column(String(20), nullable=False, default="visuals_text")
    before_json = Column(JSON, nullable=True)
    after_json = Column(JSON, nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending, done, error
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    clip = relationship("ExplainerClip", back_populates="edits")

    __table_args__ = (
        Index("ix_explainer_edits_clip_created", "clip_id", "created_at"),
    )


class ExplainerJob(Base):
    __tablename__ = "explainer_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("explainer_projects.id", ondelete="CASCADE"), nullable=False)
    clip_id = Column(String(36), ForeignKey("explainer_clips.id", ondelete="CASCADE"), nullable=True)
    job_type = Column(String(20), nullable=False)  # draft, render, prompt_edit
    status = Column(String(20), nullable=False, default="running")
    stage = Column(Text, nullable=True)
    progress = Column(Float, nullable=True)
    error = Column(Text, nullable=True)
    celery_task_id = Column(String(36), nullable=True)
    result_json = Column(JSON, nullable=True)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime, nullable=True)

    project = relationship("ExplainerProject", back_populates="jobs")

    __table_args__ = (
        Index("ix_explainer_jobs_project_type", "project_id", "job_type"),
    )
