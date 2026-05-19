from faster_whisper import WhisperModel

_model = None


def _get_model(model_size: str = "base") -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(model_size, device="cpu", compute_type="int8")
    return _model


def transcribe_audio_local(audio_path: str, model_size: str = "base") -> dict:
    """
    Transcribe audio using faster-whisper (local CTranslate2-based Whisper).
    Returns transcript with word-level timestamps.
    """
    model = _get_model(model_size)

    segments_iter, info = model.transcribe(
        audio_path,
        beam_size=5,
        word_timestamps=True,
    )

    segments = []
    words = []
    full_text_parts = []

    for seg in segments_iter:
        segments.append({
            "start": seg.start,
            "end": seg.end,
            "text": seg.text.strip(),
        })
        full_text_parts.append(seg.text.strip())

        if seg.words:
            for w in seg.words:
                words.append({
                    "start": w.start,
                    "end": w.end,
                    "word": w.word.strip(),
                })

    return {
        "text": " ".join(full_text_parts),
        "segments": segments,
        "words": words,
    }
