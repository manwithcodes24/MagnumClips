from __future__ import annotations

import textwrap


def build_draft_plan(
    prompt: str | None,
    transcript_text: str | None,
    config: dict,
) -> dict:
    """Create an initial explainer script plan.

    This deterministic fallback keeps the product flow usable without provider
    keys. It should be replaced by a Gemini strict-JSON planner while preserving
    this return shape.
    """
    source_text = (transcript_text or prompt or "Explain the selected topic clearly.").strip()
    max_clips = 1 if config.get("clip_mode") == "single" else int(config.get("max_clips", 3) or 3)
    max_clips = max(1, min(max_clips, 5))
    target_duration = int(config.get("target_duration_seconds", 45) or 45)

    chunks = _split_into_topics(source_text, max_clips)
    theme = {
        "palette": ["#0f172a", "#38bdf8", "#f8fafc", "#f59e0b"],
        "typography": "bold sans",
        "motion_style": "clean kinetic explainer",
        "caption_style": "high contrast lower third",
        "visual_density": "medium",
    }

    clips = []
    for idx, chunk in enumerate(chunks):
        title = _title_from_text(chunk, idx)
        scene_duration = round(target_duration / 3, 2)
        scenes = []
        for scene_idx, label in enumerate(["Hook", "Breakdown", "Takeaway"]):
            start = round(scene_idx * scene_duration, 2)
            end = round((scene_idx + 1) * scene_duration, 2)
            narration = _scene_narration(label, chunk)
            scenes.append({
                "index": scene_idx,
                "start_time": start,
                "end_time": end,
                "narration": narration,
                "on_screen_text": f"{label}: {title}",
                "visual_spec": {
                    "layout": "motion_graphics",
                    "elements": ["headline", "animated_cards", "caption"],
                    "direction": f"Explain the {label.lower()} using consistent MagnumClips styling.",
                },
                "assets": [],
                "style_overrides": {},
            })
        clips.append({
            "index": idx,
            "title": title,
            "topic": title,
            "narration": " ".join(scene["narration"] for scene in scenes),
            "duration": target_duration,
            "status": "draft",
            "scene_plan": {"source_excerpt": chunk},
            "scenes": scenes,
        })

    return {
        "theme": theme,
        "clips": clips,
        "notes": "Fallback deterministic draft. Replace with LLM-generated strict JSON in production.",
    }


def _split_into_topics(text: str, max_clips: int) -> list[str]:
    sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]
    if not sentences:
        return [text[:500]]
    bucket_size = max(1, len(sentences) // max_clips)
    chunks = []
    for i in range(0, len(sentences), bucket_size):
        chunks.append(". ".join(sentences[i:i + bucket_size])[:900])
        if len(chunks) >= max_clips:
            break
    return chunks or [text[:900]]


def _title_from_text(text: str, index: int) -> str:
    words = [w.strip(" ,:;()[]{}").capitalize() for w in text.split()[:6] if w.strip()]
    return " ".join(words) if words else f"Explainer Clip {index + 1}"


def _scene_narration(label: str, text: str) -> str:
    excerpt = textwrap.shorten(text, width=220, placeholder="...")
    if label == "Hook":
        return f"Here is the core idea: {excerpt}"
    if label == "Breakdown":
        return f"Let's break that down into the key parts and why they matter."
    return f"The takeaway is to remember the main concept and how each part connects."
