import os
from openai import OpenAI
from pathlib import Path

client = None


def _get_client() -> OpenAI:
    global client
    if client is None:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return client


def transcribe_audio(audio_path: str) -> dict:
    """
    Transcribe audio using OpenAI Whisper API.
    Returns transcript with word-level timestamps.
    """
    c = _get_client()

    with open(audio_path, "rb") as audio_file:
        response = c.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json",
            timestamp_granularities=["word", "segment"],
        )

    segments = []
    if hasattr(response, "segments") and response.segments:
        for seg in response.segments:
            segments.append({
                "start": seg.get("start", seg["start"]) if isinstance(seg, dict) else seg.start,
                "end": seg.get("end", seg["end"]) if isinstance(seg, dict) else seg.end,
                "text": seg.get("text", seg["text"]) if isinstance(seg, dict) else seg.text,
            })

    words = []
    if hasattr(response, "words") and response.words:
        for w in response.words:
            words.append({
                "start": w.get("start", w["start"]) if isinstance(w, dict) else w.start,
                "end": w.get("end", w["end"]) if isinstance(w, dict) else w.end,
                "word": w.get("word", w["word"]) if isinstance(w, dict) else w.word,
            })

    return {
        "text": response.text,
        "segments": segments,
        "words": words,
    }
