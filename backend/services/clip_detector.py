import os
import json
from google import genai


client = None


def _get_client() -> genai.Client:
    global client
    if client is None:
        client = genai.Client(api_key=os.getenv("GOOGLE_AI_API_KEY"))
    return client


def detect_best_clips(
    transcript: dict,
    num_clips: int = 3,
    target_duration: int = 60,
    model_name: str = "gemini-3-flash-preview",
) -> list[dict]:
    """
    Use Gemini to analyze a transcript and find the most engaging clips.
    Returns a list of clip objects with start_time, end_time, title, reason, engagement_score.
    """
    c = _get_client()

    # Build the transcript text with timestamps for context
    transcript_text = ""
    for seg in transcript.get("segments", []):
        start = seg["start"]
        end = seg["end"]
        text = seg["text"].strip()
        transcript_text += f"[{_fmt_time(start)} - {_fmt_time(end)}] {text}\n"

    prompt = f"""You are an expert video editor and content strategist. Analyze the following video transcript and identify the {num_clips} most engaging, viral-worthy segments that would make great short-form clips.

Each clip should be approximately {target_duration} seconds long (can vary ±15 seconds for better content boundaries).

Consider these factors when scoring segments:
- Emotional hooks (surprise, humor, controversy, inspiration)
- Strong opening lines that grab attention
- Complete thoughts/stories (don't cut mid-sentence)
- High information density or entertainment value
- Potential for audience engagement (comments, shares)

TRANSCRIPT:
{transcript_text}

Respond with ONLY a JSON array of clips, no other text. Each clip should have:
- "start_time": start time in seconds (float)
- "end_time": end time in seconds (float)
- "title": a catchy title for this clip (string)
- "reason": why this segment is engaging (string)
- "engagement_score": score from 1-10 (float)

Sort by engagement_score descending (best first).

JSON:"""

    response = c.models.generate_content(
        model=model_name,
        contents=prompt,
    )

    # Parse the JSON response
    text = response.text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1]  # remove first line
        if text.endswith("```"):
            text = text[:-3]
        elif "```" in text:
            text = text[:text.rfind("```")]
    text = text.strip()

    clips = json.loads(text)

    # Validate and normalize
    result = []
    for i, clip in enumerate(clips[:num_clips]):
        result.append({
            "index": i,
            "start_time": float(clip["start_time"]),
            "end_time": float(clip["end_time"]),
            "duration": float(clip["end_time"]) - float(clip["start_time"]),
            "title": clip["title"],
            "reason": clip["reason"],
            "engagement_score": float(clip["engagement_score"]),
        })

    return result


def _fmt_time(seconds: float) -> str:
    """Format seconds to MM:SS."""
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m:02d}:{s:02d}"
