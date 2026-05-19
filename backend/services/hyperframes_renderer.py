from __future__ import annotations

import json
import os
from pathlib import Path


STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "./storage"))


def render_explainer_clip(clip_payload: dict, output_name: str) -> dict:
    """Render a HyperFrames explainer clip.

    This scaffold writes a render manifest and placeholder MP4 file. The real
    implementation should generate a HyperFrames HTML composition and invoke
    `npx hyperframes render`.
    """
    explainers_dir = STORAGE_DIR / "explainers"
    manifests_dir = STORAGE_DIR / "hyperframes"
    explainers_dir.mkdir(parents=True, exist_ok=True)
    manifests_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = manifests_dir / f"{output_name}.json"
    output_path = explainers_dir / f"{output_name}.mp4"
    thumbnail_path = explainers_dir / f"{output_name}.jpg"

    manifest_path.write_text(json.dumps(clip_payload, indent=2), encoding="utf-8")
    output_path.write_bytes(b"")
    thumbnail_path.write_bytes(b"")

    return {
        "rendered_url": f"/api/files/explainers/{output_name}.mp4",
        "thumbnail_url": f"/api/files/explainers/{output_name}.jpg",
        "manifest_path": str(manifest_path),
    }
