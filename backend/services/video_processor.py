import subprocess
import json
import math
import os
import re
import time
import uuid
from pathlib import Path
from typing import Callable

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "./storage"))

# Hardware encoder detection (lazy init)
_hw_encoder: dict | None = None


def _detect_hw_encoder() -> dict:
    """Detect available hardware video encoders. Returns encoder config dict."""
    global _hw_encoder
    if _hw_encoder is not None:
        return _hw_encoder

    try:
        result = subprocess.run(
            ["ffmpeg", "-encoders"], capture_output=True, text=True, timeout=10
        )
        encoders_output = result.stdout
    except Exception:
        _hw_encoder = _cpu_encoder()
        return _hw_encoder

    # Check for GPU encoders in priority order
    if "h264_nvenc" in encoders_output:
        _hw_encoder = {
            "codec": "h264_nvenc",
            "args": ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "23", "-b:v", "0"],
            "hwaccel_args": ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"],
            "name": "NVIDIA NVENC",
        }
    elif "h264_amf" in encoders_output:
        _hw_encoder = {
            "codec": "h264_amf",
            "args": ["-c:v", "h264_amf", "-quality", "balanced"],
            "hwaccel_args": ["-hwaccel", "auto"],
            "name": "AMD AMF",
        }
    elif "h264_qsv" in encoders_output:
        _hw_encoder = {
            "codec": "h264_qsv",
            "args": ["-c:v", "h264_qsv", "-global_quality", "23"],
            "hwaccel_args": ["-hwaccel", "qsv"],
            "name": "Intel QSV",
        }
    else:
        _hw_encoder = _cpu_encoder()

    print(f"[video_processor] Using encoder: {_hw_encoder['name']}")
    return _hw_encoder


def _cpu_encoder() -> dict:
    return {
        "codec": "libx264",
        "args": ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23"],
        "hwaccel_args": [],
        "name": "libx264 (CPU)",
    }


ProgressCallback = Callable[[float, int | None], None]
"""Signature: (progress_pct: 0-100, eta_seconds: int | None) -> None"""


def _get_duration(filepath: str) -> float:
    """Get video duration in seconds (fast ffprobe call)."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", filepath],
            capture_output=True, text=True, timeout=10,
        )
        data = json.loads(r.stdout)
        return float(data.get("format", {}).get("duration", 0))
    except Exception:
        return 0


def _run_ffmpeg_with_progress(
    cmd: list[str],
    duration: float = 0,
    on_progress: ProgressCallback | None = None,
):
    """Run an FFmpeg command while parsing real-time progress.

    Inserts ``-progress pipe:1`` into *cmd* so FFmpeg writes structured
    progress data to stdout.  Stderr is captured for error reporting.
    *on_progress* is called at most once per second.
    """
    # Insert -progress, -hwaccel auto right after 'ffmpeg' (before -i)
    idx = cmd.index("ffmpeg") + 1 if "ffmpeg" in cmd else 1
    cmd = list(cmd)  # copy
    cmd[idx:idx] = ["-progress", "pipe:1", "-nostats", "-hwaccel", "auto"]

    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )

    last_update = 0.0
    out_time_us = 0

    try:
        for line in proc.stdout:  # type: ignore[union-attr]
            line = line.strip()
            if line.startswith("out_time_us="):
                try:
                    out_time_us = int(line.split("=", 1)[1])
                except ValueError:
                    pass
            elif line.startswith("speed="):
                # Only emit progress when we know duration
                if duration > 0 and on_progress and time.monotonic() - last_update >= 0.5:
                    pct = min(99.0, (out_time_us / 1_000_000) / duration * 100)
                    speed_str = line.split("=", 1)[1].strip().rstrip("x")
                    try:
                        speed = float(speed_str) if speed_str and speed_str != "N/A" else None
                    except ValueError:
                        speed = None
                    remaining = duration - out_time_us / 1_000_000
                    eta = int(remaining / speed) if speed and speed > 0 else None
                    on_progress(round(pct, 1), eta)
                    last_update = time.monotonic()
            elif line == "progress=end":
                if on_progress:
                    on_progress(100.0, 0)
    except Exception:
        pass

    stderr = proc.stderr.read() if proc.stderr else ""  # type: ignore[union-attr]
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"FFmpeg failed (rc={proc.returncode}): {stderr[:500]}")


def get_video_info(filepath: str) -> dict:
    """Get video metadata using ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        filepath
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr}")
    data = json.loads(result.stdout)

    video_stream = next(
        (s for s in data.get("streams", []) if s["codec_type"] == "video"),
        None
    )
    if not video_stream:
        raise RuntimeError("No video stream found")

    return {
        "duration": float(data["format"]["duration"]),
        "width": int(video_stream["width"]),
        "height": int(video_stream["height"]),
    }


def generate_thumbnail(filepath: str, output_path: str, timestamp: float = 1.0):
    """Generate a thumbnail from a video at the given timestamp."""
    cmd = [
        "ffmpeg", "-y", "-ss", str(timestamp),
        "-i", filepath,
        "-vframes", "1",
        "-vf", "scale=320:-1",
        output_path
    ]
    subprocess.run(cmd, capture_output=True, check=True)


def _run_text_overlays_ffmpeg(
    input_path: str,
    output_path: str,
    overlays: list[dict],
    extra_vf_before: list[str] | None = None,
    extra_vf_after: list[str] | None = None,
    trim_args: list[str] | None = None,
    audio_codec: str = "copy",
    audio_bitrate: str | None = None,
    on_progress: ProgressCallback | None = None,
):
    """Run FFmpeg with text overlays, supporting rotation via filter_complex.

    Each overlay dict must have:
        text, x_frac (float 0-1), y_frac (float 0-1), fontsize (int),
        fontcolor (str), enable_expr (str), rotation (float degrees)
    """
    encoder = _detect_hw_encoder()

    simple = [o for o in overlays if abs(o.get("rotation", 0)) < 0.5]
    rotated = [o for o in overlays if abs(o.get("rotation", 0)) >= 0.5]

    def _drawtext(ov: dict) -> str:
        text = ov["text"].replace("'", "\\'").replace(":", "\\:")
        parts = (
            f"drawtext=text='{text}'"
            f":x=(w*{ov['x_frac']:.6f})"
            f":y=(h*{ov['y_frac']:.6f})"
            f":fontsize={ov['fontsize']}"
            f":fontcolor={ov['fontcolor']}"
        )
        bw = ov.get("borderw", 0)
        if bw > 0:
            bc = ov.get("bordercolor", "black")
            parts += f":borderw={bw}:bordercolor={bc}"
        parts += f":enable='{ov['enable_expr']}'"
        return parts

    if not rotated:
        # Simple path: -vf with drawtext chain
        vf_parts = list(extra_vf_before or [])
        for ov in simple:
            vf_parts.append(_drawtext(ov))
        vf_parts.extend(extra_vf_after or [])

        cmd = ["ffmpeg", "-y"]
        if trim_args:
            cmd += trim_args
        cmd += ["-i", input_path]
        if vf_parts:
            cmd += ["-vf", ",".join(vf_parts)]
        cmd += encoder["args"]
        cmd += ["-c:a", audio_codec]
        if audio_bitrate:
            cmd += ["-b:a", audio_bitrate]
        cmd.append(output_path)
        dur = _get_duration(input_path)
        _run_ffmpeg_with_progress(cmd, duration=dur, on_progress=on_progress)
    else:
        # Complex path: filter_complex for rotated text
        fc_parts = []

        # Apply pre-vf + simple drawtext on [0:v]
        base_filters = list(extra_vf_before or [])
        for ov in simple:
            base_filters.append(_drawtext(ov))

        if base_filters:
            fc_parts.append(f"[0:v]{','.join(base_filters)}[base]")
            current = "[base]"
        else:
            current = "[0:v]"

        for idx, ov in enumerate(rotated):
            text = ov["text"].replace("'", "\\'").replace(":", "\\:")
            fontsize = ov["fontsize"]
            angle_rad = math.radians(ov["rotation"])

            # Canvas large enough for text + rotation
            est_w = max(200, len(ov["text"]) * int(fontsize * 0.7))
            est_h = max(60, fontsize * 2)
            canvas = max(est_w, est_h) * 2
            canvas = min(canvas, 4000)
            canvas += canvas % 2  # ensure even

            s, d, r, o = f"[ts{idx}]", f"[td{idx}]", f"[tr{idx}]", f"[to{idx}]"

            fc_parts.append(
                f"color=c=black@0.0:s={canvas}x{canvas},format=yuva420p{s}"
            )
            bw = ov.get("borderw", 0)
            border_str = ""
            if bw > 0:
                bc = ov.get("bordercolor", "black")
                border_str = f":borderw={bw}:bordercolor={bc}"
            fc_parts.append(
                f"{s}drawtext=text='{text}':fontsize={fontsize}"
                f":fontcolor={ov['fontcolor']}{border_str}:x=(w-tw)/2:y=(h-th)/2{d}"
            )
            fc_parts.append(
                f"{d}rotate={angle_rad:.6f}:fillcolor=none"
                f":ow=rotw({angle_rad:.6f}):oh=roth({angle_rad:.6f}){r}"
            )
            fc_parts.append(
                f"{current}{r}overlay="
                f"x='main_w*{ov['x_frac']:.6f}-overlay_w/2'"
                f":y='main_h*{ov['y_frac']:.6f}-overlay_h/2'"
                f":enable='{ov['enable_expr']}'"
                f":shortest=1{o}"
            )
            current = o

        # Apply post-vf on the final label
        if extra_vf_after:
            final_label = "[final]"
            fc_parts.append(f"{current}{','.join(extra_vf_after)}{final_label}")
            current = final_label

        cmd = ["ffmpeg", "-y"]
        if trim_args:
            cmd += trim_args
        cmd += ["-i", input_path]
        cmd += ["-filter_complex", ";".join(fc_parts)]
        cmd += ["-map", current, "-map", "0:a?"]
        cmd += encoder["args"]
        cmd += ["-c:a", audio_codec]
        if audio_bitrate:
            cmd += ["-b:a", audio_bitrate]
        cmd.append(output_path)
        dur = _get_duration(input_path)
        _run_ffmpeg_with_progress(cmd, duration=dur, on_progress=on_progress)


def burn_text_overlays(
    input_path: str,
    output_path: str,
    text_overlays: list[dict],
    trim_start: float | None = None,
    crop_track: dict | None = None,
):
    """Burn text overlays into video (used to bake text before reframing).

    When crop_track is provided, overlay x/y percentages are interpreted as
    relative to the crop region and converted to full-frame positions using
    the *first* keyframe center.  Because the crop follows the subject,
    the burned-in text will track with it after reframing.
    """
    # Pre-compute crop geometry for coordinate mapping
    if crop_track:
        src_w = crop_track["src_width"]
        src_h = crop_track["src_height"]
        aspect = crop_track["target_aspect"]
        crop_h = src_h
        crop_w = int(crop_h * aspect)
        if crop_w > src_w:
            crop_w = src_w
            crop_h = int(crop_w / aspect)
        crop_w_ratio = crop_w / src_w
        crop_h_ratio = crop_h / src_h
    else:
        crop_w_ratio = 1.0
        crop_h_ratio = 1.0

    prepared = []
    for ov in text_overlays:
        offset_start = ov["start_time"] - (trim_start or 0)
        offset_end = ov["end_time"] - (trim_start or 0)
        effective_size = int(ov.get('font_size', 48) * ov.get('scale', 1.0))

        if crop_track and crop_track.get("keyframes"):
            kfs = crop_track["keyframes"]
            avg_cx = sum(k["center_x"] for k in kfs) / len(kfs)
            avg_cy = sum(k["center_y"] for k in kfs) / len(kfs)
            crop_left = max(0, avg_cx - crop_w_ratio / 2)
            crop_top = max(0, avg_cy - crop_h_ratio / 2)
            x_frac = crop_left + (ov["x"] / 100) * crop_w_ratio
            y_frac = crop_top + (ov["y"] / 100) * crop_h_ratio
        else:
            x_frac = ov["x"] / 100
            y_frac = ov["y"] / 100

        prepared.append({
            "text": ov["text"],
            "x_frac": x_frac,
            "y_frac": y_frac,
            "fontsize": effective_size,
            "fontcolor": ov.get("color", "white"),
            "enable_expr": f"between(t,{offset_start},{offset_end})",
            "rotation": ov.get("rotation", 0),
            "borderw": ov.get("stroke_width", 0),
            "bordercolor": ov.get("stroke_color", "black"),
        })

    if not prepared:
        return

    _run_text_overlays_ffmpeg(
        input_path=input_path,
        output_path=output_path,
        overlays=prepared,
    )


def extract_audio(filepath: str, output_path: str, fmt: str = "wav"):
    """Extract audio from a video file as WAV or MP3."""
    if fmt == "mp3":
        cmd = [
            "ffmpeg", "-y", "-i", filepath,
            "-vn", "-acodec", "libmp3lame",
            "-ar", "16000", "-ac", "1", "-q:a", "6",
            output_path
        ]
    else:
        cmd = [
            "ffmpeg", "-y", "-i", filepath,
            "-vn", "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1",
            output_path
        ]
    subprocess.run(cmd, capture_output=True, check=True)


def trim_video(filepath: str, output_path: str, start: float, end: float):
    """Trim a video to the specified time range."""
    cmd = [
        "ffmpeg", "-y",
        "-i", filepath,
        "-ss", str(start),
        "-to", str(end),
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        "-movflags", "+faststart",
        output_path
    ]
    subprocess.run(cmd, capture_output=True, check=True)


def apply_color_grade(filepath: str, output_path: str, preset: str):
    """Apply color grading filter based on preset."""
    filters = {
        "warm": "colortemperature=temperature=6500,eq=saturation=1.2",
        "cool": "colortemperature=temperature=4500,eq=saturation=1.1",
        "cinematic": "eq=contrast=1.2:saturation=0.85:brightness=-0.05,unsharp=5:5:0.5",
        "vibrant": "eq=saturation=1.5:contrast=1.1",
    }
    vf = filters.get(preset)
    if not vf:
        # no grading, just copy
        subprocess.run(["ffmpeg", "-y", "-i", filepath, "-c", "copy", output_path],
                       capture_output=True, check=True)
        return

    cmd = [
        "ffmpeg", "-y", "-i", filepath,
        "-vf", vf,
        "-c:a", "copy",
        "-movflags", "+faststart",
        output_path
    ]
    subprocess.run(cmd, capture_output=True, check=True)


def burn_captions(filepath: str, subtitle_path: str, output_path: str):
    """Burn ASS subtitles into video."""
    # Escape colons and backslashes for FFmpeg filter on Windows
    safe_sub_path = subtitle_path.replace("\\", "/").replace(":", "\\:")
    cmd = [
        "ffmpeg", "-y", "-i", filepath,
        "-vf", f"ass='{safe_sub_path}'",
        "-c:a", "copy",
        "-movflags", "+faststart",
        output_path
    ]
    subprocess.run(cmd, capture_output=True, check=True)


def add_text_overlays(filepath: str, output_path: str, overlays: list[dict]):
    """Add text overlays to video using drawtext filters."""
    if not overlays:
        subprocess.run(["ffmpeg", "-y", "-i", filepath, "-c", "copy", output_path],
                       capture_output=True, check=True)
        return

    prepared = []
    for ov in overlays:
        effective_size = int(ov.get('font_size', 48) * ov.get('scale', 1.0))
        prepared.append({
            "text": ov["text"],
            "x_frac": ov["x"] / 100,
            "y_frac": ov["y"] / 100,
            "fontsize": effective_size,
            "fontcolor": ov.get("color", "white"),
            "enable_expr": f"between(t,{ov['start_time']},{ov['end_time']})",
            "rotation": ov.get("rotation", 0),
            "borderw": ov.get("stroke_width", 0),
            "bordercolor": ov.get("stroke_color", "black"),
        })

    _run_text_overlays_ffmpeg(
        input_path=filepath,
        output_path=output_path,
        overlays=prepared,
    )


def export_final(
    filepath: str,
    output_path: str,
    trim_start: float | None = None,
    trim_end: float | None = None,
    text_overlays: list[dict] | None = None,
    subtitle_path: str | None = None,
    color_preset: str | None = None,
    on_progress: ProgressCallback | None = None,
):
    """Build and run a single FFmpeg command combining all operations."""
    extra_vf_before = []
    extra_vf_after = []

    if subtitle_path:
        safe_sub = subtitle_path.replace("\\", "/").replace(":", "\\:")
        extra_vf_before.append(f"ass='{safe_sub}'")

    color_filters = {
        "warm": "colortemperature=temperature=6500,eq=saturation=1.2",
        "cool": "colortemperature=temperature=4500,eq=saturation=1.1",
        "cinematic": "eq=contrast=1.2:saturation=0.85:brightness=-0.05,unsharp=5:5:0.5",
        "vibrant": "eq=saturation=1.5:contrast=1.1",
    }
    if color_preset and color_preset in color_filters:
        extra_vf_after.append(color_filters[color_preset])

    trim_args: list[str] = []
    if trim_start is not None:
        trim_args += ["-ss", str(trim_start)]
    if trim_end is not None:
        trim_args += ["-to", str(trim_end)]

    prepared = []
    if text_overlays:
        for ov in text_overlays:
            offset_start = ov["start_time"] - (trim_start or 0)
            offset_end = ov["end_time"] - (trim_start or 0)
            effective_size = int(ov.get('font_size', 48) * ov.get('scale', 1.0))
            prepared.append({
                "text": ov["text"],
                "x_frac": ov["x"] / 100,
                "y_frac": ov["y"] / 100,
                "fontsize": effective_size,
                "fontcolor": ov.get("color", "white"),
                "enable_expr": f"between(t,{offset_start},{offset_end})",
                "rotation": ov.get("rotation", 0),
                "borderw": ov.get("stroke_width", 0),
                "bordercolor": ov.get("stroke_color", "black"),
            })

    # If no overlays but we still have vf filters, use simple ffmpeg
    if not prepared and not extra_vf_before and not extra_vf_after:
        cmd = ["ffmpeg", "-y"]
        if trim_args:
            cmd += trim_args
        cmd += ["-i", filepath]
        encoder = _detect_hw_encoder()
        cmd += encoder["args"]
        cmd += ["-c:a", "aac", "-b:a", "192k", output_path]
        dur = _get_duration(filepath)
        _run_ffmpeg_with_progress(cmd, duration=dur, on_progress=on_progress)
        return

    _run_text_overlays_ffmpeg(
        input_path=filepath,
        output_path=output_path,
        overlays=prepared,
        extra_vf_before=extra_vf_before or None,
        extra_vf_after=extra_vf_after or None,
        trim_args=trim_args or None,
        audio_codec="aac",
        audio_bitrate="192k",
        on_progress=on_progress,
    )
