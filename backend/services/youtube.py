import subprocess
import os
import re
import shutil
import sys
from pathlib import Path


def _find_yt_dlp() -> str:
    """Find yt-dlp executable, preferring the one in the current venv."""
    # Check venv Scripts directory first
    venv_bin = Path(sys.executable).parent / "yt-dlp.exe"
    if venv_bin.exists():
        return str(venv_bin)
    venv_bin = Path(sys.executable).parent / "yt-dlp"
    if venv_bin.exists():
        return str(venv_bin)
    # Fall back to PATH
    found = shutil.which("yt-dlp")
    if found:
        return found
    raise RuntimeError("yt-dlp not found. Install it with: pip install yt-dlp")


def download_youtube_video(url: str, output_dir: str, video_id: str) -> str:
    """Download a YouTube video using yt-dlp. Returns the output file path."""
    output_template = os.path.join(output_dir, f"{video_id}.%(ext)s")
    cmd = [
        _find_yt_dlp(),
        "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "--output", output_template,
        "--no-playlist",
        "--restrict-filenames",
        "--js-runtimes", "node",
        "--remote-components", "ejs:github",
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp failed: {result.stderr}")

    # Find the downloaded file
    for f in os.listdir(output_dir):
        if f.startswith(video_id) and f.endswith(".mp4"):
            return os.path.join(output_dir, f)

    raise RuntimeError("Downloaded file not found")


def validate_youtube_url(url: str) -> bool:
    """Basic validation for YouTube URLs."""
    patterns = [
        r"(https?://)?(www\.)?youtube\.com/watch\?v=[\w-]+",
        r"(https?://)?(www\.)?youtu\.be/[\w-]+",
        r"(https?://)?(www\.)?youtube\.com/shorts/[\w-]+",
    ]
    return any(re.match(p, url) for p in patterns)
