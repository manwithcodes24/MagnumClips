"""
AI-powered video reframing service.
Uses YOLOv8 for subject detection and ByteTrack for multi-object tracking,
then generates a crop track that follows subjects frame-by-frame.
"""

import math
import subprocess
import json
import os
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import torch
from ultralytics import YOLO

from models.config import AspectRatio

STORAGE_DIR = Path(os.getenv("STORAGE_DIR", "./storage"))

# Lazy-loaded YOLO model
_yolo_model: YOLO | None = None

# Detect GPU availability
_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Target aspect ratios (width/height)
ASPECT_RATIOS = {
    AspectRatio.PORTRAIT_9_16: 9 / 16,
    AspectRatio.SQUARE_1_1: 1.0,
}

# YOLO person class ID
PERSON_CLASS_ID = 0

# Sampling rate for detection (frames per second)
DETECTION_FPS = 2


def _get_model() -> YOLO:
    """Get or load the YOLOv8 nano model on GPU if available."""
    global _yolo_model
    if _yolo_model is None:
        _yolo_model = YOLO("yolov8n.pt")
        _yolo_model.to(_DEVICE)
        print(f"[reframe] YOLO model loaded on device: {_DEVICE}")
    return _yolo_model


def _iou(box_a: tuple, box_b: tuple) -> float:
    """Compute IoU between two boxes (x1, y1, x2, y2)."""
    x1 = max(box_a[0], box_b[0])
    y1 = max(box_a[1], box_b[1])
    x2 = min(box_a[2], box_b[2])
    y2 = min(box_a[3], box_b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def detect_subjects(video_path: str, max_frames: int = 10) -> list[dict]:
    """
    Detect subjects in the first few frames of a video.
    Returns a list of detected subjects with bounding boxes.
    """
    model = _get_model()
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_interval = max(1, int(fps / DETECTION_FPS))

    subjects = {}
    frame_idx = 0
    sampled = 0

    while sampled < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_interval != 0:
            frame_idx += 1
            continue

        results = model.track(frame, persist=True, tracker="bytetrack.yaml", verbose=False, device=_DEVICE)
        if results and results[0].boxes is not None:
            boxes = results[0].boxes
            for i in range(len(boxes)):
                track_id = int(boxes.id[i]) if boxes.id is not None else i
                cls = int(boxes.cls[i])
                conf = float(boxes.conf[i])
                x1, y1, x2, y2 = boxes.xyxy[i].tolist()

                if track_id not in subjects or conf > subjects[track_id]["confidence"]:
                    subjects[track_id] = {
                        "track_id": track_id,
                        "class_id": cls,
                        "class_name": model.names[cls],
                        "confidence": round(conf, 3),
                        "bbox": {
                            "x": round(x1 / width, 4),
                            "y": round(y1 / height, 4),
                            "width": round((x2 - x1) / width, 4),
                            "height": round((y2 - y1) / height, 4),
                        },
                        "timestamp": round(frame_idx / fps, 3),
                    }

        frame_idx += 1
        sampled += 1

    cap.release()
    return list(subjects.values())


def generate_crop_track(
    video_path: str,
    target_aspect: AspectRatio,
    subject_id: Optional[int] = None,
    anchors: Optional[list[dict]] = None,
    progress_callback=None,
) -> dict:
    """
    Generate a crop track for the video.
    
    Args:
        video_path: Path to source video file.
        target_aspect: Target aspect ratio enum.
        subject_id: YOLO track ID to follow (auto-track mode).
        anchors: List of manual anchor points with bbox (manual-track mode).
        progress_callback: Optional callback(progress_float) for progress updates.
    
    Returns:
        CropTrackSchema-compatible dict with keyframes.
    """
    model = _get_model()
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_interval = max(1, int(fps / DETECTION_FPS))

    aspect_ratio = ASPECT_RATIOS.get(target_aspect, 9 / 16)

    # Calculate target crop dimensions within source frame
    crop_h = src_h
    crop_w = int(crop_h * aspect_ratio)
    if crop_w > src_w:
        crop_w = src_w
        crop_h = int(crop_w / aspect_ratio)

    # Output dimensions
    target_h = 1920
    target_w = int(target_h * aspect_ratio)

    keyframes = []
    default_cx = 0.5
    default_cy = 0.5

    # Manual tracking with CSRT fallback
    if anchors and len(anchors) > 0:
        keyframes = _track_with_anchors(cap, fps, src_w, src_h, frame_interval,
                                        total_frames, anchors, progress_callback)
    else:
        # Auto-tracking: detect & follow subject
        keyframes = _auto_track(cap, model, fps, src_w, src_h, frame_interval,
                                total_frames, subject_id, progress_callback)

    cap.release()

    # If no keyframes generated, center crop
    if not keyframes:
        keyframes = [{"timestamp": 0.0, "center_x": 0.5, "center_y": 0.5}]

    # Smooth the crop track
    keyframes = _smooth_keyframes(keyframes, crop_w / src_w, crop_h / src_h)

    return {
        "src_width": src_w,
        "src_height": src_h,
        "target_aspect": round(aspect_ratio, 6),
        "target_width": target_w,
        "target_height": target_h,
        "keyframes": keyframes,
    }


def _auto_track(
    cap, model, fps, src_w, src_h, frame_interval, total_frames,
    subject_id, progress_callback,
) -> list[dict]:
    """Auto-track using YOLO + ByteTrack. Computes zoom based on subject size."""
    keyframes = []
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_interval == 0:
            results = model.track(frame, persist=True, tracker="bytetrack.yaml", verbose=False, device=_DEVICE)

            cx, cy = 0.5, 0.5
            zoom = 1.0
            found = False

            if results and results[0].boxes is not None:
                boxes = results[0].boxes
                for i in range(len(boxes)):
                    tid = int(boxes.id[i]) if boxes.id is not None else -1
                    x1, y1, x2, y2 = boxes.xyxy[i].tolist()

                    if subject_id is not None:
                        if tid == subject_id:
                            cx = (x1 + x2) / 2 / src_w
                            cy = (y1 + y2) / 2 / src_h
                            zoom = _compute_zoom(x1, y1, x2, y2, src_w, src_h)
                            found = True
                            break
                    else:
                        # Default: follow largest person or first detection
                        cls = int(boxes.cls[i])
                        if cls == PERSON_CLASS_ID:
                            cx = (x1 + x2) / 2 / src_w
                            cy = (y1 + y2) / 2 / src_h
                            zoom = _compute_zoom(x1, y1, x2, y2, src_w, src_h)
                            found = True
                            break

                # If no specific subject found, use first detection
                if not found and len(boxes) > 0 and subject_id is None:
                    x1, y1, x2, y2 = boxes.xyxy[0].tolist()
                    cx = (x1 + x2) / 2 / src_w
                    cy = (y1 + y2) / 2 / src_h
                    zoom = _compute_zoom(x1, y1, x2, y2, src_w, src_h)

            timestamp = round(frame_idx / fps, 3)
            keyframes.append({
                "timestamp": timestamp,
                "center_x": round(cx, 4),
                "center_y": round(cy, 4),
                "zoom": round(zoom, 3),
            })

            if progress_callback and total_frames > 0:
                progress_callback(frame_idx / total_frames)

        frame_idx += 1

    return keyframes


def _compute_zoom(x1: float, y1: float, x2: float, y2: float,
                  src_w: int, src_h: int) -> float:
    """Compute a zoom level based on subject bounding box size.
    
    Zoom in when the subject is small in frame (e.g. far away),
    zoom out (towards 1.0) when the subject is large.
    The zoom is always >= 1.0 and aspect ratio is preserved.
    """
    subj_w = (x2 - x1) / src_w  # fraction of frame width
    subj_h = (y2 - y1) / src_h  # fraction of frame height
    subj_size = max(subj_w, subj_h)

    # Target: subject should occupy ~40-60% of the crop region
    target_fill = 0.45
    if subj_size < 0.01:
        return 1.0

    raw_zoom = target_fill / subj_size
    # Clamp: min 0.5 (zoom out 2x), max 3.0 (zoom in 3x)
    return max(0.5, min(3.0, raw_zoom))


def _track_with_anchors(
    cap, fps, src_w, src_h, frame_interval, total_frames,
    anchors, progress_callback,
) -> list[dict]:
    """Track using manual anchor points with OpenCV CSRT tracker."""
    keyframes = []

    # Sort anchors by timestamp
    sorted_anchors = sorted(anchors, key=lambda a: a["timestamp"])

    # Initialize CSRT tracker at first anchor
    first = sorted_anchors[0]
    anchor_frame = int(first["timestamp"] * fps)

    # Seek to anchor frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    tracker = None
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx == anchor_frame or (tracker is None and frame_idx == 0):
            # Initialize tracker with anchor bbox
            ax = int(first["x"] * src_w)
            ay = int(first["y"] * src_h)
            aw = int(first["width"] * src_w)
            ah = int(first["height"] * src_h)
            # CSRT expects (x, y, w, h) as top-left + size
            bbox = (ax, ay, aw, ah)
            tracker = cv2.TrackerCSRT_create()
            tracker.init(frame, bbox)
            cx = (ax + aw / 2) / src_w
            cy = (ay + ah / 2) / src_h
            keyframes.append({
                "timestamp": round(frame_idx / fps, 3),
                "center_x": round(cx, 4),
                "center_y": round(cy, 4),
            })
        elif tracker is not None and frame_idx % frame_interval == 0:
            # Check if we need to re-anchor
            current_time = frame_idx / fps
            for anchor in sorted_anchors[1:]:
                if abs(current_time - anchor["timestamp"]) < 0.5 / fps:
                    ax = int(anchor["x"] * src_w)
                    ay = int(anchor["y"] * src_h)
                    aw = int(anchor["width"] * src_w)
                    ah = int(anchor["height"] * src_h)
                    tracker = cv2.TrackerCSRT_create()
                    tracker.init(frame, (ax, ay, aw, ah))
                    break

            ok, bbox = tracker.update(frame)
            if ok:
                x, y, w, h = bbox
                cx = (x + w / 2) / src_w
                cy = (y + h / 2) / src_h
            else:
                cx, cy = 0.5, 0.5

            keyframes.append({
                "timestamp": round(frame_idx / fps, 3),
                "center_x": round(cx, 4),
                "center_y": round(cy, 4),
            })

        if progress_callback and total_frames > 0:
            progress_callback(frame_idx / total_frames)

        frame_idx += 1

    return keyframes


def _smooth_keyframes(
    keyframes: list[dict],
    crop_w_ratio: float,
    crop_h_ratio: float,
    window: int = 5,
) -> list[dict]:
    """Smooth keyframe positions and zoom with a moving average and clamp to bounds."""
    if len(keyframes) <= 1:
        return keyframes

    half_w = crop_w_ratio / 2
    half_h = crop_h_ratio / 2

    # Extract center positions and zoom
    cx_vals = [kf["center_x"] for kf in keyframes]
    cy_vals = [kf["center_y"] for kf in keyframes]
    zoom_vals = [kf.get("zoom", 1.0) for kf in keyframes]

    # Moving average smoothing
    smoothed = []
    for i in range(len(keyframes)):
        start = max(0, i - window // 2)
        end = min(len(keyframes), i + window // 2 + 1)
        avg_cx = sum(cx_vals[start:end]) / (end - start)
        avg_cy = sum(cy_vals[start:end]) / (end - start)
        avg_zoom = sum(zoom_vals[start:end]) / (end - start)

        # Adjust half extents by zoom (zoom > 1 means smaller crop)
        z = max(0.5, min(3.0, avg_zoom))
        adj_half_w = half_w / z
        adj_half_h = half_h / z

        # Clamp so crop stays within frame
        avg_cx = max(adj_half_w, min(1 - adj_half_w, avg_cx))
        avg_cy = max(adj_half_h, min(1 - adj_half_h, avg_cy))

        smoothed.append({
            "timestamp": keyframes[i]["timestamp"],
            "center_x": round(avg_cx, 4),
            "center_y": round(avg_cy, 4),
            "zoom": round(z, 3),
        })

    return smoothed


def apply_reframe(
    input_path: str,
    output_path: str,
    crop_track: dict,
    on_progress=None,
) -> str:
    """
    Apply reframe crop track to video using FFmpeg crop + scale.
    Supports per-keyframe zoom levels with locked aspect ratio.
    Uses keyframe interpolation to generate per-frame crop positions.
    
    Returns the output file path.
    """
    src_w = crop_track["src_width"]
    src_h = crop_track["src_height"]
    target_w = crop_track["target_width"]
    target_h = crop_track["target_height"]
    keyframes = crop_track["keyframes"]
    target_aspect = crop_track["target_aspect"]

    # Base crop size in pixels (zoom=1.0)
    base_crop_h = src_h
    base_crop_w = int(base_crop_h * target_aspect)
    if base_crop_w > src_w:
        base_crop_w = src_w
        base_crop_h = int(base_crop_w / target_aspect)

    if len(keyframes) == 1:
        # Static crop — single keyframe with zoom
        kf = keyframes[0]
        zoom = max(0.5, min(3.0, kf.get("zoom", 1.0)))
        crop_w = max(2, int(base_crop_w / zoom))
        crop_h = max(2, int(base_crop_h / zoom))
        # Ensure crop_w/crop_h maintain aspect ratio
        crop_w = int(crop_h * target_aspect)
        if crop_w > src_w:
            crop_w = src_w
            crop_h = int(crop_w / target_aspect)

        cx_px = int(kf["center_x"] * src_w)
        cy_px = int(kf["center_y"] * src_h)
        x = max(0, min(src_w - crop_w, cx_px - crop_w // 2))
        y = max(0, min(src_h - crop_h, cy_px - crop_h // 2))

        vf = f"crop={crop_w}:{crop_h}:{x}:{y},scale={target_w}:{target_h}"
        _run_ffmpeg_reframe(input_path, output_path, vf, on_progress=on_progress)
        return output_path

    # Dynamic crop with zoom — generate sendcmd with per-keyframe crop sizes
    sendcmd_path = output_path + ".sendcmd.txt"
    _generate_sendcmd(keyframes, src_w, src_h, base_crop_w, base_crop_h,
                      target_aspect, sendcmd_path)

    # Use initial keyframe zoom for the starting crop size
    init_zoom = max(0.5, min(3.0, keyframes[0].get("zoom", 1.0)))
    init_crop_w = max(2, int(base_crop_w / init_zoom))
    init_crop_h = max(2, int(base_crop_h / init_zoom))
    init_crop_w = int(init_crop_h * target_aspect)
    if init_crop_w > src_w:
        init_crop_w = src_w
        init_crop_h = int(init_crop_w / target_aspect)

    vf = (
        f"sendcmd=f='{_escape_ffmpeg_path(sendcmd_path)}',"
        f"crop={init_crop_w}:{init_crop_h}:0:0,"
        f"scale={target_w}:{target_h}"
    )
    _run_ffmpeg_reframe(input_path, output_path, vf, on_progress=on_progress)

    # Clean up sendcmd file
    try:
        os.remove(sendcmd_path)
    except OSError:
        pass

    return output_path


def _generate_sendcmd(
    keyframes: list[dict],
    src_w: int, src_h: int,
    base_crop_w: int, base_crop_h: int,
    target_aspect: float,
    output_path: str,
):
    """Generate FFmpeg sendcmd script for dynamic crop positioning with zoom."""
    lines = []
    for kf in keyframes:
        ts = kf["timestamp"]
        zoom = max(0.5, min(3.0, kf.get("zoom", 1.0)))

        # Compute crop size for this keyframe (locked aspect ratio)
        crop_h = max(2, int(base_crop_h / zoom))
        crop_w = max(2, int(crop_h * target_aspect))
        if crop_w > src_w:
            crop_w = src_w
            crop_h = max(2, int(crop_w / target_aspect))
        if crop_h > src_h:
            crop_h = src_h
            crop_w = max(2, int(crop_h * target_aspect))

        cx_px = int(kf["center_x"] * src_w)
        cy_px = int(kf["center_y"] * src_h)
        x = max(0, min(src_w - crop_w, cx_px - crop_w // 2))
        y = max(0, min(src_h - crop_h, cy_px - crop_h // 2))
        lines.append(f"{ts:.3f} [enter] crop w {crop_w};")
        lines.append(f"{ts:.3f} [enter] crop h {crop_h};")
        lines.append(f"{ts:.3f} [enter] crop x {x};")
        lines.append(f"{ts:.3f} [enter] crop y {y};")

    Path(output_path).write_text("\n".join(lines), encoding="utf-8")


def _escape_ffmpeg_path(path: str) -> str:
    """Escape path for FFmpeg filter expressions."""
    return path.replace("\\", "/").replace(":", "\\:")


def _run_ffmpeg_reframe(input_path: str, output_path: str, vf: str,
                        on_progress=None):
    """Run FFmpeg with the given video filter for reframing."""
    from services.video_processor import _detect_hw_encoder, _run_ffmpeg_with_progress, _get_duration

    encoder = _detect_hw_encoder()
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-vf", vf,
    ] + encoder["args"] + [
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        output_path,
    ]
    dur = _get_duration(input_path)
    _run_ffmpeg_with_progress(cmd, duration=dur, on_progress=on_progress)
