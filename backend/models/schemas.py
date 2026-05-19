from pydantic import BaseModel, Field, model_validator
from typing import Optional
from models.config import VideoConfig


class YouTubeRequest(BaseModel):
    url: str


class VideoInfo(BaseModel):
    id: str
    filename: str
    duration: float
    width: int
    height: int
    thumbnail_url: Optional[str] = None


class ClipResult(BaseModel):
    index: int
    start_time: float
    end_time: float
    duration: float
    title: str
    reason: str
    engagement_score: float
    thumbnail_url: Optional[str] = None
    clip_url: Optional[str] = None


class AnalyzeResponse(BaseModel):
    video_id: str
    clips: list[ClipResult]


class TextOverlay(BaseModel):
    text: str
    x: float  # 0-100 percentage
    y: float  # 0-100 percentage
    start_time: float
    end_time: float
    font_size: int = 48
    color: str = "#FFFFFF"
    font: str = "Arial"
    follow_reframe: bool = False
    scale: float = 1.0    # multiplier, 1.0 = normal
    rotation: float = 0.0 # degrees
    stroke_color: str = "#000000"
    stroke_width: int = 0


class EditRequest(BaseModel):
    trim_start: Optional[float] = None
    trim_end: Optional[float] = None
    text_overlays: list[TextOverlay] = []


class ExportRequest(BaseModel):
    video_id: str
    clip_index: int
    edits: EditRequest
    config: VideoConfig


class ProgressEvent(BaseModel):
    stage: str
    progress: float  # 0-100
    message: str


# ── Reframe schemas ──

class AnchorSchema(BaseModel):
    timestamp: float
    x: float       # normalized 0-1, center x of bbox
    y: float       # normalized 0-1, center y of bbox
    width: float   # normalized 0-1
    height: float  # normalized 0-1


class ManualTrackRequest(BaseModel):
    anchors: list[AnchorSchema]


class CropKeyframeSchema(BaseModel):
    timestamp: float
    center_x: float    # normalized 0-1
    center_y: float    # normalized 0-1
    zoom: float = 1.0  # 1.0 = default crop, >1 = zoom in, <1 = zoom out (clamped to frame)
    subject_id: Optional[int] = None


class CropTrackSchema(BaseModel):
    src_width: int
    src_height: int
    target_aspect: float       # e.g. 0.5625 for 9:16
    target_width: int          # e.g. 1080
    target_height: int         # e.g. 1920
    keyframes: list[CropKeyframeSchema]


# --- Explainer schemas ---

class ExplainerConfig(BaseModel):
    clip_mode: str = "auto_multiple"  # auto_multiple, single
    max_clips: int = Field(default=5, ge=1, le=5)
    target_duration_seconds: int = Field(default=45, ge=15, le=120)
    aspect_ratio: str = "9:16"
    visual_style: str = "motion_graphics"
    source_visual_usage: str = "light"
    tts_provider: str = "deepgram"
    tts_model: str = "aura-2"
    voice_id: Optional[str] = None


class ExplainerProjectCreate(BaseModel):
    input_type: str = "prompt"  # prompt, youtube, upload, existing_video
    prompt: Optional[str] = None
    source_url: Optional[str] = None
    video_id: Optional[str] = None
    config: ExplainerConfig = Field(default_factory=ExplainerConfig)

    @model_validator(mode="after")
    def validate_input(self):
        if self.input_type == "prompt" and not self.prompt:
            raise ValueError("prompt is required for prompt input")
        if self.input_type == "youtube" and not self.source_url:
            raise ValueError("source_url is required for youtube input")
        if self.input_type in ("upload", "existing_video") and not self.video_id:
            raise ValueError("video_id is required for uploaded/existing video input")
        return self


class ExplainerSceneSchema(BaseModel):
    id: Optional[str] = None
    index: int
    start_time: float = 0
    end_time: float = 0
    narration: Optional[str] = None
    on_screen_text: Optional[str] = None
    visual_spec: dict = Field(default_factory=dict)
    assets: list[dict] = Field(default_factory=list)
    style_overrides: dict = Field(default_factory=dict)


class ExplainerClipSchema(BaseModel):
    id: Optional[str] = None
    index: int
    title: str
    topic: Optional[str] = None
    narration: Optional[str] = None
    duration: Optional[float] = None
    status: str = "draft"
    scene_plan: dict = Field(default_factory=dict)
    scenes: list[ExplainerSceneSchema] = Field(default_factory=list)
    rendered_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    error: Optional[str] = None


class ExplainerProjectResponse(BaseModel):
    id: str
    input_type: str
    video_id: Optional[str] = None
    source_url: Optional[str] = None
    prompt: Optional[str] = None
    status: str
    config: ExplainerConfig
    theme: dict = Field(default_factory=dict)
    script_plan: Optional[dict] = None
    clips: list[ExplainerClipSchema] = Field(default_factory=list)
    error: Optional[str] = None


class ExplainerScriptPlanUpdate(BaseModel):
    script_plan: dict
    clips: list[ExplainerClipSchema] = Field(default_factory=list)


class ExplainerJobResponse(BaseModel):
    id: str
    project_id: str
    clip_id: Optional[str] = None
    job_type: str
    status: str
    stage: Optional[str] = None
    progress: Optional[float] = None
    error: Optional[str] = None


class PromptEditSelection(BaseModel):
    scene_ids: Optional[list[str]] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None

    @model_validator(mode="after")
    def validate_selection(self):
        has_scenes = bool(self.scene_ids)
        has_range = self.start_time is not None and self.end_time is not None
        if not has_scenes and not has_range:
            raise ValueError("Select at least one scene or a start/end time range")
        if has_range and self.end_time <= self.start_time:
            raise ValueError("end_time must be greater than start_time")
        return self


class PromptEditRequest(BaseModel):
    selection: PromptEditSelection
    prompt: str
    scope: str = "visuals_text"


class PromptEditResponse(BaseModel):
    id: str
    clip_id: str
    selection: dict
    prompt: str
    scope: str
    status: str
    before: Optional[dict] = None
    after: Optional[dict] = None
    error: Optional[str] = None
