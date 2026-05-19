from pydantic import BaseModel
from typing import Optional
from enum import Enum


class CaptionFont(str, Enum):
    BOLD = "bold"
    SANS = "sans"
    SERIF = "serif"
    HANDWRITTEN = "handwritten"


class CaptionPosition(str, Enum):
    TOP = "top"
    CENTER = "center"
    BOTTOM = "bottom"


class CaptionStyle(str, Enum):
    WORD_BY_WORD = "word_by_word"
    FULL_SENTENCE = "full_sentence"


class ColorGradePreset(str, Enum):
    NONE = "none"
    WARM = "warm"
    COOL = "cool"
    CINEMATIC = "cinematic"
    VIBRANT = "vibrant"


class AspectRatio(str, Enum):
    ORIGINAL = "original"
    PORTRAIT_9_16 = "9:16"
    SQUARE_1_1 = "1:1"


class GeminiModel(str, Enum):
    FLASH = "gemini-3-flash-preview"
    PRO = "gemini-3-pro-preview"


class TranscriptionProvider(str, Enum):
    WHISPER = "whisper"
    GEMINI = "gemini"
    LOCAL = "local"


class VideoConfig(BaseModel):
    transcription_provider: TranscriptionProvider = TranscriptionProvider.LOCAL
    captions_enabled: bool = True
    caption_font: CaptionFont = CaptionFont.BOLD
    caption_position: CaptionPosition = CaptionPosition.BOTTOM
    caption_style: CaptionStyle = CaptionStyle.WORD_BY_WORD
    color_grade_enabled: bool = False
    color_grade_preset: ColorGradePreset = ColorGradePreset.NONE
    target_clip_duration: int = 60  # seconds
    num_clips: int = 3
    gemini_model: GeminiModel = GeminiModel.FLASH
    reframe_enabled: bool = False
    target_aspect_ratio: AspectRatio = AspectRatio.ORIGINAL
