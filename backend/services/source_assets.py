from __future__ import annotations


def select_light_source_assets(video_id: str | None, scenes: list[dict]) -> list[dict]:
    """Return lightweight source asset placeholders for explainer scenes."""
    if not video_id:
        return []
    return [
        {
            "type": "source_reference",
            "video_id": video_id,
            "usage": "light",
            "scene_indices": [scene.get("index") for scene in scenes[:2]],
        }
    ]
