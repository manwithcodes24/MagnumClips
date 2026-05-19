from __future__ import annotations

import os
from pathlib import Path


def synthesize_voiceover(
    text: str,
    output_path: str,
    provider: str = "deepgram",
    model: str = "aura-2",
    voice_id: str | None = None,
) -> str:
    """Generate voiceover audio.

    The current implementation writes a placeholder marker so the pipeline can
    be tested without provider keys. Provider-specific API calls should replace
    this body while preserving the function contract.
    """
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    marker = (
        f"provider={provider}\nmodel={model}\nvoice_id={voice_id or ''}\n"
        f"deepgram_key={'set' if os.getenv('DEEPGRAM_API_KEY') else 'missing'}\n"
        f"elevenlabs_key={'set' if os.getenv('ELEVENLABS_API_KEY') else 'missing'}\n"
        f"text={text[:500]}\n"
    )
    path.write_text(marker, encoding="utf-8")
    return str(path)
