from models.config import CaptionFont, CaptionPosition, CaptionStyle


# Font mapping for ASS subtitles
FONT_MAP = {
    CaptionFont.BOLD: "Arial Bold",
    CaptionFont.SANS: "Arial",
    CaptionFont.SERIF: "Times New Roman",
    CaptionFont.HANDWRITTEN: "Comic Sans MS",
}

POSITION_MAP = {
    CaptionPosition.TOP: 8,      # ASS alignment: top-center
    CaptionPosition.CENTER: 5,   # ASS alignment: middle-center
    CaptionPosition.BOTTOM: 2,   # ASS alignment: bottom-center
}


def generate_ass_subtitles(
    words: list[dict],
    segments: list[dict],
    font: CaptionFont = CaptionFont.BOLD,
    position: CaptionPosition = CaptionPosition.BOTTOM,
    style: CaptionStyle = CaptionStyle.WORD_BY_WORD,
    trim_start: float = 0,
    trim_end: float | None = None,
    target_width: int = 1920,
    target_height: int = 1080,
) -> str:
    """
    Generate ASS subtitle content from Whisper transcript data.
    
    Args:
        words: List of word-level timestamps from Whisper
        segments: List of segment-level timestamps from Whisper
        font: Caption font choice
        position: Caption position choice
        style: Caption style (word-by-word highlight or full sentence)
        trim_start: Start offset for trimmed clips
        trim_end: End offset for trimmed clips
        target_width: Output video width (e.g., 1080 for portrait)
        target_height: Output video height (e.g., 1920 for portrait)
    """
    font_name = FONT_MAP.get(font, "Arial Bold")
    alignment = POSITION_MAP.get(position, 2)

    # Scale font size relative to output height
    base_fontsize = 72
    fontsize = int(base_fontsize * target_height / 1080)

    header = f"""[Script Info]
Title: MagnumClips Captions
ScriptType: v4.00+
PlayResX: {target_width}
PlayResY: {target_height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{fontsize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,{alignment},40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    events = []

    if style == CaptionStyle.WORD_BY_WORD and words:
        events = _generate_word_by_word(words, segments, trim_start, trim_end)
    elif segments:
        events = _generate_full_sentence(segments, trim_start, trim_end)
    else:
        return header

    return header + "\n".join(events) + "\n"


def _generate_word_by_word(
    words: list[dict],
    segments: list[dict],
    trim_start: float,
    trim_end: float | None,
) -> list[str]:
    """Generate word-by-word highlighted captions using ASS override tags."""
    events = []

    # Group words into display chunks (roughly by segment)
    for seg in segments:
        seg_start = seg["start"] - trim_start
        seg_end = seg["end"] - trim_start

        if seg_start < 0:
            continue
        if trim_end and seg_start > (trim_end - trim_start):
            break

        # Find words within this segment
        seg_words = [
            w for w in words
            if w["start"] >= seg["start"] - 0.1 and w["end"] <= seg["end"] + 0.1
        ]
        if not seg_words:
            continue

        # Create a dialogue line for each word highlight phase
        for i, word in enumerate(seg_words):
            w_start = word["start"] - trim_start
            w_end = word["end"] - trim_start
            if w_start < 0:
                continue

            # Build text with current word highlighted
            parts = []
            for j, w in enumerate(seg_words):
                if j == i:
                    # Highlighted word: yellow color
                    parts.append(f"{{\\c&H00FFFF&}}{w['word']}{{\\c&HFFFFFF&}}")
                else:
                    parts.append(w["word"])
            text = " ".join(parts)

            start_ts = _seconds_to_ass(w_start)
            end_ts = _seconds_to_ass(w_end)
            events.append(f"Dialogue: 0,{start_ts},{end_ts},Default,,0,0,0,,{text}")

    return events


def _generate_full_sentence(
    segments: list[dict],
    trim_start: float,
    trim_end: float | None,
) -> list[str]:
    """Generate full-sentence captions."""
    events = []
    for seg in segments:
        start = seg["start"] - trim_start
        end = seg["end"] - trim_start
        if start < 0:
            start = 0
        if trim_end and start > (trim_end - trim_start):
            break
        text = seg["text"].strip()
        start_ts = _seconds_to_ass(start)
        end_ts = _seconds_to_ass(end)
        events.append(f"Dialogue: 0,{start_ts},{end_ts},Default,,0,0,0,,{text}")
    return events


def _seconds_to_ass(seconds: float) -> str:
    """Convert seconds to ASS timestamp format H:MM:SS.CC."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"
