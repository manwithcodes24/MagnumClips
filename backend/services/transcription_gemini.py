import os
import json
from google import genai


client = None
GEMINI_DEFAULT_MODEL = os.getenv("GEMINI_DEFAULT_MODEL", "gemini-3-flash-preview")
LEGACY_FLASH_MODELS = {"gemini-2.5-flash", "models/gemini-2.5-flash"}


def _get_client() -> genai.Client:
    global client
    if client is None:
        client = genai.Client(api_key=os.getenv("GOOGLE_AI_API_KEY") or os.getenv("GEMINI_API_KEY"))
    return client


def transcribe_audio_gemini(
    audio_path: str,
    model_name: str = "gemini-3-flash-preview",
) -> dict:
    """
    Transcribe audio using Gemini's native audio understanding.
    Returns transcript with segment-level and word-level timestamps.
    """
    c = _get_client()

    # Upload the audio file
    with open(audio_path, "rb") as f:
        audio_data = f.read()

    prompt = """Transcribe this audio with precise timestamps. Return ONLY a JSON object with:
{
  "text": "full transcript text",
  "segments": [
    {"start": 0.0, "end": 3.5, "text": "segment text here"}
  ],
  "words": [
    {"start": 0.0, "end": 0.3, "word": "word"}
  ]
}

Rules:
- "start" and "end" are in seconds (float)
- "segments" should be sentence-level chunks
- "words" should have every individual word with its timestamp
- Be as precise as possible with timing
- Return ONLY valid JSON, no other text"""

    response = c.models.generate_content(
        model=_resolve_model_name(model_name),
        contents=[
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "audio/wav",
                            "data": __import__("base64").b64encode(audio_data).decode(),
                        }
                    },
                ]
            }
        ],
    )

    # Parse JSON response
    text = response.text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3]
        elif "```" in text:
            text = text[:text.rfind("```")]
    text = text.strip()

    result = json.loads(text)

    return {
        "text": result.get("text", ""),
        "segments": result.get("segments", []),
        "words": result.get("words", []),
    }


def _resolve_model_name(model_name: str) -> str:
    """Use the production default when old Gemini Flash IDs are passed in."""
    return GEMINI_DEFAULT_MODEL if model_name in LEGACY_FLASH_MODELS else model_name
