"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import {
  getFileUrl,
  getTranscript,
  detectSubjects,
  autoTrack,
  getCropTrack,
  type TextOverlay,
  type SubjectDetection,
  type CropTrack,
} from "@/lib/api";

const ASPECT_MAP: Record<string, number> = { "9:16": 9 / 16, "1:1": 1 };

export default function EditorPage() {
  const router = useRouter();
  const {
    videoInfo,
    clips,
    config,
    selectedClipIndex,
    trimStart,
    trimEnd,
    setTrimStart,
    setTrimEnd,
    textOverlays,
    addTextOverlay,
    removeTextOverlay,
    updateTextOverlay,
    cropTrack,
    setCropTrack,
    transcript,
    setTranscript,
    reframeLoading,
    setReframeLoading,
    updateConfig,
  } = useAppStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const seekingRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAddText, setShowAddText] = useState(false);
  const [newText, setNewText] = useState("");
  const [subjects, setSubjects] = useState<SubjectDetection[]>([]);
  const [zoomOverride, setZoomOverride] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"reframe" | "text" | "info">(
    "reframe",
  );
  const [draggingOverlayIndex, setDraggingOverlayIndex] = useState<
    number | null
  >(null);
  const [selectedOverlayIndex, setSelectedOverlayIndex] = useState<
    number | null
  >(null);
  const [editingOverlayIndex, setEditingOverlayIndex] = useState<number | null>(
    null,
  );
  const [editingText, setEditingText] = useState("");
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const playerContentRef = useRef<HTMLDivElement>(null);
  const [playerHeight, setPlayerHeight] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastPaintedTimeRef = useRef(0);

  const clip =
    selectedClipIndex !== null
      ? clips.find((c) => c.index === selectedClipIndex)
      : null;

  useEffect(() => {
    if (!videoInfo || selectedClipIndex === null || !clip) {
      router.replace("/");
    }
  }, [videoInfo, selectedClipIndex, clip, router]);

  // Track player section height for transcript sizing
  useEffect(() => {
    const el = playerContentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setPlayerHeight(el.offsetHeight);
    });
    observer.observe(el);
    setPlayerHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, []);

  // Load transcript
  useEffect(() => {
    if (videoInfo && !transcript) {
      getTranscript(videoInfo.id)
        .then(setTranscript)
        .catch(() => {});
    }
  }, [videoInfo, transcript, setTranscript]);

  // Load existing crop track
  useEffect(() => {
    if (videoInfo && selectedClipIndex !== null && !cropTrack) {
      getCropTrack(videoInfo.id, selectedClipIndex)
        .then(setCropTrack)
        .catch(() => {});
    }
  }, [videoInfo, selectedClipIndex, cropTrack, setCropTrack]);

  // Draw reframed preview on canvas
  const drawPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.readyState < 2) return;

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;

    // Always use the config's aspect ratio so switching ratios updates instantly
    const ar = config.target_aspect_ratio;
    if (ar === "original" || !ASPECT_MAP[ar]) return;
    const aspect = ASPECT_MAP[ar];

    // Use cropTrack keyframes for position if available, otherwise center
    let kf: { center_x: number; center_y: number; zoom: number };
    if (cropTrack) {
      const realKf = getCurrentKeyframe(cropTrack, currentTime);
      kf = realKf ?? { center_x: 0.5, center_y: 0.5, zoom: 1.0 };
    } else {
      kf = { center_x: 0.5, center_y: 0.5, zoom: 1.0 };
    }

    // Derive output size from aspect ratio
    let outW: number;
    let outH: number;
    if (aspect < 1) {
      outW = Math.min(1080, Math.round(srcH * aspect));
      outH = Math.round(outW / aspect);
    } else {
      outH = Math.min(1080, srcH);
      outW = Math.round(outH * aspect);
    }

    const zoom = Math.max(0.5, Math.min(3.0, kf.zoom));

    // Base crop at zoom=1
    let baseCropW = aspect * srcH;
    let baseCropH = srcH;
    if (baseCropW > srcW) {
      baseCropW = srcW;
      baseCropH = srcW / aspect;
    }

    // Apply zoom (zoom > 1 = smaller crop = zoom in)
    let cropW = baseCropW / zoom;
    let cropH = baseCropH / zoom;
    // Enforce aspect ratio lock
    cropW = cropH * aspect;
    if (cropW > srcW) { cropW = srcW; cropH = srcW / aspect; }
    if (cropH > srcH) { cropH = srcH; cropW = srcH * aspect; }

    const cx = kf.center_x * srcW;
    const cy = kf.center_y * srcH;
    const sx = Math.max(0, Math.min(srcW - cropW, cx - cropW / 2));
    const sy = Math.max(0, Math.min(srcH - cropH, cy - cropH / 2));

    canvas.width = outW;
    canvas.height = outH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      ctx.drawImage(
        video,
        sx,
        sy,
        cropW,
        cropH,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      // Draw text overlays on the reframed preview
      for (const ov of textOverlays) {
        if (currentTime < ov.start_time || currentTime > ov.end_time) continue;

        const scale = ov.scale ?? 1;
        const rotation = ov.rotation ?? 0;
        const fontSize = Math.round(
          ov.font_size * scale * (canvas.width / 1080),
        );
        const strokeWidth = ov.stroke_width ?? 0;

        let drawX: number;
        let drawY: number;

        if (ov.follow_reframe) {
          // Position is relative to the crop region
          drawX = (ov.x / 100) * canvas.width;
          drawY = (ov.y / 100) * canvas.height;
        } else {
          // Position is relative to the full source frame — map into crop
          const fullX = (ov.x / 100) * srcW;
          const fullY = (ov.y / 100) * srcH;
          drawX = ((fullX - sx) / cropW) * canvas.width;
          drawY = ((fullY - sy) / cropH) * canvas.height;
        }

        ctx.save();
        ctx.translate(drawX, drawY);
        if (Math.abs(rotation) > 0.5) {
          ctx.rotate((rotation * Math.PI) / 180);
        }
        ctx.font = `bold ${fontSize}px ${ov.font || "Arial"}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (strokeWidth > 0) {
          ctx.strokeStyle = ov.stroke_color ?? "#000000";
          ctx.lineWidth = strokeWidth * scale * (canvas.width / 1080);
          ctx.lineJoin = "round";
          ctx.strokeText(ov.text, 0, 0);
        }

        ctx.fillStyle = ov.color || "#FFFFFF";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillText(ov.text, 0, 0);
        ctx.restore();
      }
    } catch {
      // cross-origin security error — ignored
    }
  }, [cropTrack, currentTime, textOverlays, config.target_aspect_ratio]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  // Keep framing updates smooth while playing; `timeupdate` alone is too coarse.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      const video = videoRef.current;
      if (video && !seekingRef.current) {
        const now = video.currentTime;
        if (Math.abs(now - lastPaintedTimeRef.current) >= 1 / 30) {
          lastPaintedTimeRef.current = now;
          setCurrentTime(now);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying]);

  if (!videoInfo || selectedClipIndex === null || !clip) return null;

  const clipUrl = clip.clip_url ? getFileUrl(clip.clip_url) : null;

  // Load video as blob for reliable seeking (avoids moov atom / Range issues)
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!clipUrl) return;
    let revoke: string | null = null;
    fetch(clipUrl)
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        revoke = url;
        setBlobUrl(url);
      })
      .catch(() => setBlobUrl(null));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [clipUrl]);

  const handleTimeUpdate = () => {
    if (videoRef.current && !seekingRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      if (trimEnd === null) setTrimEnd(videoRef.current.duration);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const seekTo = (time: number) => {
    if (videoRef.current) {
      seekingRef.current = true;
      setCurrentTime(time);
      videoRef.current.currentTime = time;
    }
  };

  const handleAddTextOverlay = () => {
    if (!newText.trim()) return;
    const overlay: TextOverlay = {
      text: newText,
      x: 50,
      y: 80,
      start_time: trimStart || 0,
      end_time: trimEnd || duration,
      font_size: 48,
      color: "#FFFFFF",
      font: "Arial",
      follow_reframe: true,
      scale: 1.0,
      rotation: 0,
      stroke_color: "#000000",
      stroke_width: 0,
    };
    addTextOverlay(overlay);
    setNewText("");
    setShowAddText(false);
  };

  const handleDetectSubjects = async () => {
    setReframeLoading(true);
    try {
      const res = await detectSubjects(videoInfo.id, selectedClipIndex);
      setSubjects(res.subjects);
    } catch {
      alert("Failed to detect subjects");
    } finally {
      setReframeLoading(false);
    }
  };

  const handleAutoTrack = async (subjectId?: number) => {
    setReframeLoading(true);
    try {
      const track = await autoTrack(
        videoInfo.id,
        selectedClipIndex,
        config.target_aspect_ratio,
        subjectId,
      );
      setCropTrack(track);
      setZoomOverride(null);
    } catch {
      alert("Auto-tracking failed");
    } finally {
      setReframeLoading(false);
    }
  };

  // Apply a global zoom override to all keyframes (locked aspect ratio)
  const handleZoomChange = (newZoom: number) => {
    if (!cropTrack) return;
    const clamped = Math.max(0.5, Math.min(3.0, newZoom));
    setZoomOverride(clamped);
    const updated = {
      ...cropTrack,
      keyframes: cropTrack.keyframes.map((kf) => ({
        ...kf,
        zoom: clamped,
      })),
    };
    setCropTrack(updated);
  };

  // Get the current effective zoom for display
  const currentZoom = (() => {
    if (zoomOverride !== null) return zoomOverride;
    if (!cropTrack) return 1.0;
    const kf = getCurrentKeyframe(cropTrack, currentTime);
    return kf?.zoom ?? 1.0;
  })();

  // Calculate crop overlay dimensions for video preview
  const getCropOverlay = () => {
    if (!videoRef.current) return null;
    const videoEl = videoRef.current;
    const displayW = videoEl.clientWidth;
    const displayH = videoEl.clientHeight;

    // Always use config's aspect ratio so switching ratios updates overlay instantly
    const ar = config.target_aspect_ratio;
    if (ar === "original" || !ASPECT_MAP[ar]) return null;
    const cropAspect = ASPECT_MAP[ar];

    // Use cropTrack keyframes for position if available, otherwise center
    let kf: { center_x: number; center_y: number; zoom: number };
    if (cropTrack) {
      const realKf = getCurrentKeyframe(cropTrack, currentTime);
      kf = realKf ?? { center_x: 0.5, center_y: 0.5, zoom: 1.0 };
    } else {
      kf = { center_x: 0.5, center_y: 0.5, zoom: 1.0 };
    }

    const srcW = videoEl.videoWidth || 1;
    const srcH = videoEl.videoHeight || 1;

    const zoom = Math.max(0.5, Math.min(3.0, kf.zoom));

    // Base crop size as fraction of source (zoom=1)
    let cropWRatio = cropAspect * (srcH / srcW);
    let cropHRatio = 1.0;
    if (cropWRatio > 1) {
      cropWRatio = 1.0;
      cropHRatio = srcW / cropAspect / srcH;
    }

    // Apply zoom (zoom > 1 = smaller crop = zoomed in)
    cropWRatio /= zoom;
    cropHRatio /= zoom;

    const overlayW = cropWRatio * displayW;
    const overlayH = cropHRatio * displayH;
    const overlayX = kf.center_x * displayW - overlayW / 2;
    const overlayY = kf.center_y * displayH - overlayH / 2;

    return {
      width: overlayW,
      height: overlayH,
      left: Math.max(0, Math.min(displayW - overlayW, overlayX)),
      top: Math.max(0, Math.min(displayH - overlayH, overlayY)),
    };
  };

  const cropOverlay = getCropOverlay();

  return (
    <main className="flex-1 flex flex-col px-4 py-4 min-h-0">
      <div className="w-full max-w-[1600px] mx-auto flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">
            <span className="text-[var(--color-primary)]">Edit</span>:{" "}
            {clip.title}
          </h1>
          <button
            onClick={() => router.push("/export")}
            className="px-6 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium text-sm transition-colors"
          >
            Export →
          </button>
        </div>

        {/* 3-panel layout */}
        <div className="flex gap-4 flex-1 min-h-0">
          {/* LEFT: Transcript Panel */}
          <div
            className="w-72 lg:w-80 flex-shrink-0 bg-[var(--color-surface)]/80 backdrop-blur-md rounded-xl border border-[var(--color-border)] flex flex-col overflow-hidden shadow-xl relative"
            style={playerHeight ? { height: playerHeight } : undefined}
          >
            <div className="px-4 py-3 border-b border-[var(--color-border)]/50 bg-black/20">
              <h2 className="font-semibold text-sm flex items-center justify-between">
                <span>Transcript</span>
                <span className="text-[10px] bg-[var(--color-primary)]/20 text-[var(--color-primary)] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm">
                  Interactive
                </span>
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
              {transcript?.words && transcript.words.length > 0 ? (
                <TranscriptWords
                  words={transcript.words}
                  clipStart={clip.start_time}
                  clipEnd={clip.end_time}
                  currentTime={currentTime}
                  onWordClick={(time) => seekTo(time)}
                />
              ) : transcript?.segments && transcript.segments.length > 0 ? (
                <TranscriptSegments
                  segments={transcript.segments}
                  clipStart={clip.start_time}
                  clipEnd={clip.end_time}
                  currentTime={currentTime}
                  onSegmentClick={(time) => seekTo(time)}
                />
              ) : (
                <p className="text-sm text-[var(--color-muted)] py-4">
                  No transcript available
                </p>
              )}
            </div>
          </div>

          {/* CENTER: Video Preview + Timeline */}
          <div className="flex-1 flex flex-col min-w-0">
            <div ref={playerContentRef} className="flex flex-col">
              {/* Video with crop overlay */}
              <div
                ref={videoContainerRef}
                className="relative bg-black rounded-xl overflow-hidden flex-shrink-0"
              >
                {clipUrl && (
                  <video
                    ref={videoRef}
                    src={blobUrl || clipUrl}
                    preload="auto"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onSeeked={() => {
                      seekingRef.current = false;
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    className="w-full"
                    onClick={togglePlay}
                  />
                )}

                {/* Crop overlay */}
                {cropOverlay && (
                  <>
                    {/* Dimmed outside areas */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div
                        className="absolute bg-black/50"
                        style={{
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${cropOverlay.top}px`,
                        }}
                      />
                      <div
                        className="absolute bg-black/50"
                        style={{
                          top: `${cropOverlay.top + cropOverlay.height}px`,
                          left: 0,
                          width: "100%",
                          bottom: 0,
                        }}
                      />
                      <div
                        className="absolute bg-black/50"
                        style={{
                          top: `${cropOverlay.top}px`,
                          left: 0,
                          width: `${cropOverlay.left}px`,
                          height: `${cropOverlay.height}px`,
                        }}
                      />
                      <div
                        className="absolute bg-black/50"
                        style={{
                          top: `${cropOverlay.top}px`,
                          left: `${cropOverlay.left + cropOverlay.width}px`,
                          right: 0,
                          height: `${cropOverlay.height}px`,
                        }}
                      />
                    </div>
                    {/* Crop border */}
                    <div
                      className="absolute border-2 border-[var(--color-primary)] rounded pointer-events-none"
                      style={{
                        left: `${cropOverlay.left}px`,
                        top: `${cropOverlay.top}px`,
                        width: `${cropOverlay.width}px`,
                        height: `${cropOverlay.height}px`,
                      }}
                    />
                  </>
                )}

                {/* Click on empty area to deselect overlay */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div
                  className="absolute inset-0 z-20"
                  style={{
                    pointerEvents:
                      selectedOverlayIndex !== null ? "auto" : "none",
                  }}
                  onClick={() => setSelectedOverlayIndex(null)}
                />

                {/* Text overlay previews — draggable, resizable, rotatable */}
                {textOverlays.map((ov, i) => {
                  const visible =
                    currentTime >= ov.start_time && currentTime <= ov.end_time;
                  if (!visible) return null;

                  const container = videoContainerRef.current;
                  const containerW = container?.clientWidth || 1;
                  const containerH = container?.clientHeight || 1;

                  const followCrop = ov.follow_reframe && cropOverlay;
                  let displayLeft: string;
                  let displayTop: string;
                  if (followCrop) {
                    const pxX =
                      cropOverlay.left + (ov.x / 100) * cropOverlay.width;
                    const pxY =
                      cropOverlay.top + (ov.y / 100) * cropOverlay.height;
                    displayLeft = `${(pxX / containerW) * 100}%`;
                    displayTop = `${(pxY / containerH) * 100}%`;
                  } else {
                    displayLeft = `${ov.x}%`;
                    displayTop = `${ov.y}%`;
                  }

                  const isSelected = selectedOverlayIndex === i;
                  const scaledFontSize = (ov.font_size * (ov.scale ?? 1)) / 3;

                  return (
                    <div
                      key={i}
                      className="absolute select-none"
                      style={{
                        left: displayLeft,
                        top: displayTop,
                        transform: `translate(-50%, -50%) rotate(${ov.rotation ?? 0}deg)`,
                        zIndex: isSelected ? 35 : 30,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOverlayIndex(i);
                      }}
                    >
                      {/* Text body — draggable, double-click to edit */}
                      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                      <div
                        className="cursor-grab active:cursor-grabbing"
                        style={{
                          fontSize: `${scaledFontSize}px`,
                          color: ov.color,
                          WebkitTextStroke:
                            (ov.stroke_width ?? 0) > 0
                              ? `${ov.stroke_width}px ${ov.stroke_color ?? "#000000"}`
                              : undefined,
                          paintOrder: "stroke fill",
                          textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
                          fontWeight: "bold",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: isSelected
                            ? "1px dashed var(--color-primary)"
                            : "1px dashed transparent",
                          whiteSpace: "nowrap",
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingOverlayIndex(i);
                          setEditingText(ov.text);
                        }}
                        onMouseDown={(e) => {
                          if (editingOverlayIndex === i) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setDraggingOverlayIndex(i);
                          setSelectedOverlayIndex(i);
                          const cont = videoContainerRef.current;
                          if (!cont) return;

                          const onMouseMove = (ev: MouseEvent) => {
                            const rect = cont.getBoundingClientRect();
                            if (ov.follow_reframe && cropOverlay) {
                              const cropLeftPx = rect.left + cropOverlay.left;
                              const cropTopPx = rect.top + cropOverlay.top;
                              const xPct = Math.max(
                                0,
                                Math.min(
                                  100,
                                  ((ev.clientX - cropLeftPx) /
                                    cropOverlay.width) *
                                    100,
                                ),
                              );
                              const yPct = Math.max(
                                0,
                                Math.min(
                                  100,
                                  ((ev.clientY - cropTopPx) /
                                    cropOverlay.height) *
                                    100,
                                ),
                              );
                              updateTextOverlay(i, { x: xPct, y: yPct });
                            } else {
                              const xPct = Math.max(
                                0,
                                Math.min(
                                  100,
                                  ((ev.clientX - rect.left) / rect.width) * 100,
                                ),
                              );
                              const yPct = Math.max(
                                0,
                                Math.min(
                                  100,
                                  ((ev.clientY - rect.top) / rect.height) * 100,
                                ),
                              );
                              updateTextOverlay(i, { x: xPct, y: yPct });
                            }
                          };
                          const onMouseUp = () => {
                            setDraggingOverlayIndex(null);
                            window.removeEventListener(
                              "mousemove",
                              onMouseMove,
                            );
                            window.removeEventListener("mouseup", onMouseUp);
                          };
                          window.addEventListener("mousemove", onMouseMove);
                          window.addEventListener("mouseup", onMouseUp);
                        }}
                      >
                        {editingOverlayIndex === i ? (
                          <input
                            type="text"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onBlur={() => {
                              if (editingText.trim()) {
                                updateTextOverlay(i, {
                                  text: editingText.trim(),
                                });
                              }
                              setEditingOverlayIndex(null);
                            }}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter") {
                                if (editingText.trim()) {
                                  updateTextOverlay(i, {
                                    text: editingText.trim(),
                                  });
                                }
                                setEditingOverlayIndex(null);
                              } else if (e.key === "Escape") {
                                setEditingOverlayIndex(null);
                              }
                            }}
                            className="bg-transparent border-none outline-none text-inherit font-inherit"
                            style={{
                              fontSize: "inherit",
                              color: "inherit",
                              fontWeight: "inherit",
                              width: `${Math.max(editingText.length, 1) + 2}ch`,
                              caretColor: "white",
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                        ) : (
                          ov.text
                        )}
                      </div>

                      {/* Resize & Rotate handles — only when selected */}
                      {isSelected && (
                        <>
                          {/* Corner resize handle (bottom-right) */}
                          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                          <div
                            className="absolute -bottom-2 -right-2 w-4 h-4 bg-[var(--color-primary)] rounded-sm cursor-se-resize"
                            style={{ zIndex: 36 }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const startY = e.clientY;
                              const startScale = ov.scale ?? 1;

                              const onMouseMove = (ev: MouseEvent) => {
                                const dy = ev.clientY - startY;
                                const newScale = Math.max(
                                  0.2,
                                  Math.min(5, startScale + dy / 80),
                                );
                                updateTextOverlay(i, {
                                  scale: Math.round(newScale * 100) / 100,
                                });
                              };
                              const onMouseUp = () => {
                                window.removeEventListener(
                                  "mousemove",
                                  onMouseMove,
                                );
                                window.removeEventListener(
                                  "mouseup",
                                  onMouseUp,
                                );
                              };
                              window.addEventListener("mousemove", onMouseMove);
                              window.addEventListener("mouseup", onMouseUp);
                            }}
                          />

                          {/* Rotate handle (top-center, outside) */}
                          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                          <div
                            className="absolute -top-6 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[var(--color-primary)] cursor-crosshair flex items-center justify-center"
                            style={{ zIndex: 36 }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const el = (e.currentTarget as HTMLElement)
                                .parentElement;
                              if (!el) return;

                              const onMouseMove = (ev: MouseEvent) => {
                                const rect = el.getBoundingClientRect();
                                const centerX = rect.left + rect.width / 2;
                                const centerY = rect.top + rect.height / 2;
                                const angle =
                                  Math.atan2(
                                    ev.clientY - centerY,
                                    ev.clientX - centerX,
                                  ) *
                                    (180 / Math.PI) +
                                  90;
                                const snapped = Math.round(angle);
                                updateTextOverlay(i, { rotation: snapped });
                              };
                              const onMouseUp = () => {
                                window.removeEventListener(
                                  "mousemove",
                                  onMouseMove,
                                );
                                window.removeEventListener(
                                  "mouseup",
                                  onMouseUp,
                                );
                              };
                              window.addEventListener("mousemove", onMouseMove);
                              window.addEventListener("mouseup", onMouseUp);
                            }}
                          >
                            <span className="text-[8px] text-white leading-none">
                              ↻
                            </span>
                          </div>

                          {/* Line connecting rotate handle to element */}
                          <div
                            className="absolute -top-6 left-1/2 w-px h-4 bg-[var(--color-primary)]"
                            style={{
                              transform: "translateX(-50%)",
                              top: "-16px",
                              zIndex: 35,
                            }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Timeline & Controls */}
              <div className="mt-4 bg-[var(--color-surface)]/80 backdrop-blur-md rounded-xl p-4 border border-[var(--color-border)] shadow-xl">
                <div className="flex items-center gap-4 mb-4">
                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 flex items-center justify-center bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-full shadow-lg shadow-[var(--color-primary)]/30 transition-all transform hover:scale-105 active:scale-95"
                  >
                    {isPlaying ? (
                      <span className="text-sm font-black">⏸</span>
                    ) : (
                      <span className="text-base font-black ml-0.5">▶</span>
                    )}
                  </button>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium font-mono text-white/90">
                      {formatTime(currentTime)}
                    </span>
                    <span className="text-[10px] text-[var(--color-muted)] font-mono">
                      / {formatTime(duration)}
                    </span>
                  </div>
                  <div className="flex-1" />
                  <button
                    onClick={() => router.push("/clips")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/10 text-xs text-[var(--color-muted)] hover:text-white transition-all duration-200 group"
                  >
                    <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
                    Back to Clips
                  </button>
                </div>

                <div className="relative h-10 bg-black/40 rounded-lg overflow-hidden border border-[var(--color-border)]/50 group cursor-pointer">
                  {/* Trim range */}
                  <div
                    className="absolute h-full bg-[var(--color-primary)]/20 border-x-2 border-[var(--color-primary)]/80"
                    style={{
                      left: `${((trimStart || 0) / (duration || 1)) * 100}%`,
                      width: `${(((trimEnd || duration) - (trimStart || 0)) / (duration || 1)) * 100}%`,
                    }}
                  />
                  {/* Keyframe markers */}
                  {cropTrack?.keyframes.map((kf, i) => (
                    <div
                      key={i}
                      className="absolute top-0 w-[2px] h-full bg-yellow-400/60 shadow-[0_0_4px_rgba(250,204,21,0.5)]"
                      style={{
                        left: `${(kf.timestamp / (duration || 1)) * 100}%`,
                      }}
                    />
                  ))}
                  {/* Playhead */}
                  <div
                    className="absolute top-0 w-[2px] h-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] z-10 pointer-events-none"
                    style={{
                      left: `${(currentTime / (duration || 1)) * 100}%`,
                    }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => seekTo(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                </div>

                {/* Trim controls */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-black/20 p-2 rounded-lg border border-[var(--color-border)]/50">
                    <label className="block text-[10px] text-[var(--color-muted)] uppercase tracking-wider mb-1 px-1">
                      Start Time (s)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={trimEnd || duration}
                      step={0.1}
                      value={trimStart || 0}
                      onChange={(e) => setTrimStart(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-md bg-black/40 border border-[var(--color-border)] text-xs text-white font-mono focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                    />
                  </div>
                  <div className="bg-black/20 p-2 rounded-lg border border-[var(--color-border)]/50">
                    <label className="block text-[10px] text-[var(--color-muted)] uppercase tracking-wider mb-1 px-1">
                      End Time (s)
                    </label>
                    <input
                      type="number"
                      min={trimStart || 0}
                      max={duration}
                      step={0.1}
                      value={trimEnd || duration}
                      onChange={(e) => setTrimEnd(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-md bg-black/40 border border-[var(--color-border)] text-xs text-white font-mono focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Tools sidebar */}
          <div 
            className="w-80 lg:w-96 flex-shrink-0 flex flex-col overflow-hidden bg-[var(--color-surface)]/80 backdrop-blur-md rounded-xl border border-[var(--color-border)] shadow-xl relative"
            style={playerHeight ? { height: playerHeight } : undefined}
          >
            {/* Tabs */}
            <div className="flex p-1.5 border-b border-[var(--color-border)]/50 bg-black/20">
              {(
                [
                  { key: "reframe", label: "Reframe" },
                  { key: "text", label: "Text" },
                  { key: "info", label: "Info" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                    activeTab === tab.key
                      ? "bg-[var(--color-primary)]/20 text-[var(--color-primary)] shadow-sm"
                      : "text-[var(--color-muted)] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-hidden p-3 flex flex-col">
              {/* Reframe tab */}
              {activeTab === "reframe" && (
                <div className="flex flex-col h-full gap-3">
                  {/* Aspect ratio selector */}
                  <div className="bg-black/20 p-2.5 rounded-xl border border-[var(--color-border)]/50 hide-on-hover flex-shrink-0">
                    <p className="text-[10px] font-semibold text-[var(--color-muted)] mb-1.5 uppercase tracking-wider">
                      Aspect Ratio
                    </p>
                    <div className="flex gap-2">
                      {(["9:16", "1:1", "original"] as const).map((ar) => (
                        <button
                          key={ar}
                          onClick={() =>
                            updateConfig({
                              target_aspect_ratio: ar,
                              reframe_enabled: ar !== "original",
                            })
                          }
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                            config.target_aspect_ratio === ar
                              ? "bg-[var(--color-primary)] text-white shadow-md shadow-[var(--color-primary)]/20"
                              : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-white hover:border-white/20"
                          }`}
                        >
                          {ar === "9:16"
                            ? "9:16"
                            : ar === "1:1"
                              ? "1:1"
                              : "Original"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {config.target_aspect_ratio === "original" ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-[var(--color-border)] rounded-xl bg-black/10">
                      <div className="w-10 h-10 mb-3 rounded-full bg-white/5 flex items-center justify-center text-[var(--color-muted)] text-xl">
                        📱
                      </div>
                      <p className="text-sm text-[var(--color-muted)]">
                        Select a target aspect ratio to enable AI auto-framing.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col flex-1 min-h-0 gap-3">
                      {/* Processing indicator */}
                      {reframeLoading && (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 animate-pulse">
                          <div className="w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                          <p className="text-sm text-[var(--color-primary)] font-medium">
                            Auto-framing in progress…
                          </p>
                        </div>
                      )}

                      {/* Subject tracking options */}
                      <div className="bg-black/20 p-2.5 rounded-xl border border-[var(--color-border)]/50 space-y-2 flex-shrink-0">
                         <p className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">
                          Subject Tracking
                         </p>
                        <button
                          onClick={handleDetectSubjects}
                          disabled={reframeLoading}
                          className="w-full py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-[var(--color-primary)]/20 flex items-center justify-center gap-2"
                        >
                          <span>🎯</span>
                          {subjects.length > 0
                            ? "Re-scan for Subjects"
                            : "Detect Subjects using AI"}
                        </button>

                        {/* Subject list */}
                        {subjects.length > 0 && (
                          <div className="pt-2">
                            <p className="text-xs text-[var(--color-muted)] mb-2">
                              Choose Subject to Track
                            </p>
                            <div className="space-y-2">
                              {subjects.map((s) => (
                                <button
                                  key={s.track_id}
                                  onClick={() => handleAutoTrack(s.track_id)}
                                  disabled={reframeLoading}
                                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                                >
                                  <span className="font-medium group-hover:text-[var(--color-primary)]">
                                    {s.class_name} <span className="text-[10px] opacity-60 px-1.5 py-0.5 border border-white/10 rounded bg-black/40 ml-1">#{s.track_id}</span>
                                  </span>
                                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)]">
                                    {(s.confidence * 100).toFixed(0)}% conf
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 py-1">
                          <div className="flex-1 h-px bg-[var(--color-border)]/50" />
                          <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-wide">Or</span>
                          <div className="flex-1 h-px bg-[var(--color-border)]/50" />
                        </div>

                        <button
                          onClick={() => handleAutoTrack()}
                          disabled={reframeLoading}
                          className="w-full py-2 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-muted)] hover:text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Auto-track (Saliency based)
                        </button>
                      </div>

                      {/* Crop track status & Preview */}
                      {(cropTrack || config.target_aspect_ratio !== "original") && (
                        <div className="bg-black/20 p-2.5 rounded-xl border border-[var(--color-border)]/50 flex flex-col flex-1 min-h-[0px]">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 flex-shrink-0">
                             <div className="flex items-center gap-3">
                               <p className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-wider flex items-center gap-1.5">
                                  <span>📱</span> View
                               </p>
                               {cropTrack && (
                                 <div className="flex items-center gap-1 bg-black/40 px-1.5 py-1 rounded-lg border border-[var(--color-border)]/50" title="Zoom Control">
                                    <span className="text-[10px] opacity-70 px-0.5 hidden xl:inline">🔍</span>
                                    <button
                                      onClick={() => handleZoomChange(currentZoom - 0.1)}
                                      disabled={currentZoom <= 0.5}
                                      className="w-4 h-4 rounded bg-white/5 disabled:opacity-30 flex items-center justify-center text-xs hover:bg-white/10 transition-colors"
                                    >
                                      −
                                    </button>
                                    <input
                                      type="range"
                                      min="0.5"
                                      max="3.0"
                                      step="0.05"
                                      value={currentZoom}
                                      onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                                      className="w-12 h-1 mx-1 rounded-full bg-white/10 appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-primary)] cursor-pointer"
                                    />
                                    <button
                                      onClick={() => handleZoomChange(currentZoom + 0.1)}
                                      disabled={currentZoom >= 3.0}
                                      className="w-4 h-4 rounded bg-white/5 disabled:opacity-30 flex items-center justify-center text-xs hover:bg-white/10 transition-colors"
                                    >
                                      +
                                    </button>
                                    <button
                                      onClick={() => handleZoomChange(1.0)}
                                      className="text-[9px] font-mono text-[var(--color-muted)] hover:text-[var(--color-primary)] flex items-center justify-center min-w-[3.5ch] transition-colors ml-1"
                                    >
                                      {currentZoom.toFixed(1)}×
                                    </button>
                                 </div>
                               )}
                             </div>
                             {cropTrack ? (
                               <span className="text-[9px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full border border-green-400/20 shadow-sm flex items-center gap-1 font-medium uppercase tracking-wide">
                                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                                  <span className="hidden xl:inline">Ready</span>
                               </span>
                             ) : (
                               <span className="text-[9px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full border border-yellow-400/20 shadow-sm flex items-center gap-1 font-medium uppercase tracking-wide">
                                  <span className="hidden xl:inline">Preview</span>
                               </span>
                             )}
                          </div>

                          <div className="flex justify-center bg-black/40 rounded-lg p-2 border border-[var(--color-border)]/50 backdrop-blur-md flex-1 min-h-[0px] overflow-hidden">
                            <canvas
                              ref={previewCanvasRef}
                              className="rounded shadow-xl w-auto h-full object-contain border border-white/10"
                              style={{
                                aspectRatio: config.target_aspect_ratio === "9:16" ? "9 / 16" : "1 / 1",
                              }}
                            />
                          </div>

                          <div className="text-[10px] text-[var(--color-muted)] flex items-center justify-between mt-2 px-1 flex-shrink-0">
                            <span className="flex items-center gap-1"><span className="text-white/40">Ratio:</span> <span className="font-mono text-white/80">{config.target_aspect_ratio}</span></span>
                            {cropTrack && (
                              <span className="flex items-center gap-1"><span className="text-white/40">Frames:</span> <span className="font-mono text-white/80">{cropTrack.keyframes.length}</span></span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Text tab */}
              {activeTab === "text" && (
                <div className="space-y-4">
                  {textOverlays.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-[var(--color-border)] rounded-xl bg-black/10">
                      <div className="w-10 h-10 mb-3 rounded-full bg-white/5 flex items-center justify-center text-[var(--color-muted)] text-xl">
                        🔤
                      </div>
                      <p className="text-sm text-[var(--color-muted)]">
                        No text overlays added
                      </p>
                    </div>
                  )}

                  {textOverlays.map((ov, i) => (
                    <div
                      key={i}
                      className="bg-black/20 p-3 rounded-xl border border-[var(--color-border)]/50 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-white break-all">{ov.text}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[10px] text-[var(--color-muted)] bg-black/40 px-1.5 py-0.5 rounded">
                                {formatTime(ov.start_time)} — {formatTime(ov.end_time)}
                             </span>
                             <span className="text-[10px] text-[var(--color-muted)] bg-black/40 px-1.5 py-0.5 rounded">
                                Pos: {Math.round(ov.x)}%, {Math.round(ov.y)}%
                             </span>
                          </div>
                        </div>
                        <button
                          onClick={() => removeTextOverlay(i)}
                          className="w-6 h-6 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 flex items-center justify-center transition-colors shadow-sm"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="h-px w-full bg-[var(--color-border)]/50" />

                      {/* Color picker */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-muted)] font-medium">
                          Color
                        </span>
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] uppercase font-mono text-[var(--color-muted)]">
                             {ov.color}
                           </span>
                           <div className="w-6 h-6 rounded-md overflow-hidden border border-[var(--color-border)] relative cursor-pointer group shadow-sm">
                             <input
                               type="color"
                               value={ov.color}
                               onChange={(e) => updateTextOverlay(i, { color: e.target.value })}
                               className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer opacity-0"
                             />
                             <div className="w-full h-full" style={{ backgroundColor: ov.color }} />
                           </div>
                        </div>
                      </div>

                      {/* Stroke color + width */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-[var(--color-muted)] font-medium">Stroke</span>
                          <div className="flex items-center gap-2">
                             <span className="text-[10px] uppercase font-mono text-[var(--color-muted)]">
                               {ov.stroke_color ?? "#000000"}
                             </span>
                             <div className="w-6 h-6 rounded-md overflow-hidden border border-[var(--color-border)] relative cursor-pointer shadow-sm">
                               <input
                                 type="color"
                                 value={ov.stroke_color ?? "#000000"}
                                 onChange={(e) => updateTextOverlay(i, { stroke_color: e.target.value })}
                                 className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer opacity-0"
                               />
                               <div className="w-full h-full" style={{ backgroundColor: ov.stroke_color ?? "#000000" }} />
                             </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                           <input
                             type="range"
                             min="0"
                             max="10"
                             step="1"
                             value={ov.stroke_width ?? 0}
                             onChange={(e) => updateTextOverlay(i, { stroke_width: parseInt(e.target.value) })}
                             className="flex-1 h-1.5 rounded-full bg-white/10 appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-primary)]"
                           />
                           <span className="text-[10px] tabular-nums text-[var(--color-muted)] w-6 text-right font-mono">
                             {ov.stroke_width ?? 0}px
                           </span>
                        </div>
                      </div>

                      {/* Scale slider */}
                      <div className="space-y-1.5">
                         <div className="flex justify-between items-center">
                           <span className="text-xs text-[var(--color-muted)] font-medium">Scale</span>
                         </div>
                         <div className="flex items-center gap-3">
                           <input
                             type="range"
                             min="0.2"
                             max="5"
                             step="0.05"
                             value={ov.scale ?? 1}
                             onChange={(e) => updateTextOverlay(i, { scale: parseFloat(e.target.value) })}
                             className="flex-1 h-1.5 rounded-full bg-white/10 appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-primary)]"
                           />
                           <span className="text-[10px] tabular-nums text-[var(--color-muted)] w-6 text-right font-mono">
                             {(ov.scale ?? 1).toFixed(1)}×
                           </span>
                         </div>
                      </div>

                      {/* Rotation slider */}
                      <div className="space-y-1.5">
                         <div className="flex justify-between items-center">
                           <span className="text-xs text-[var(--color-muted)] font-medium">Rotate</span>
                         </div>
                         <div className="flex items-center gap-3">
                           <input
                             type="range"
                             min="-180"
                             max="180"
                             step="1"
                             value={ov.rotation ?? 0}
                             onChange={(e) => updateTextOverlay(i, { rotation: parseInt(e.target.value) })}
                             className="flex-1 h-1.5 rounded-full bg-white/10 appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-primary)]"
                           />
                           <span className="text-[10px] tabular-nums text-[var(--color-muted)] w-6 text-right font-mono">
                             {ov.rotation ?? 0}°
                           </span>
                         </div>
                      </div>

                      {/* Move with autoframe toggle */}
                      {config.reframe_enabled && (
                        <div className="pt-2 mt-2 border-t border-[var(--color-border)]/50 flex items-center justify-between">
                          <span className="text-xs text-[var(--color-muted)] font-medium">
                            Track Autoframe
                          </span>
                          <button
                            onClick={() => updateTextOverlay(i, { follow_reframe: !ov.follow_reframe })}
                            className={`relative w-8 h-4 rounded-full transition-colors ${
                              ov.follow_reframe
                                ? "bg-[var(--color-primary)]"
                                : "bg-white/10"
                            }`}
                          >
                            <span
                              className={`absolute top-[2px] left-[2px] w-3 h-3 rounded-full bg-white transition-transform ${
                                ov.follow_reframe ? "translate-x-4" : ""
                              }`}
                            />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {showAddText ? (
                    <div className="mt-4 p-3 bg-black/20 rounded-xl border border-[var(--color-border)]/50 space-y-3">
                      <input
                        type="text"
                        value={newText}
                        onChange={(e) => setNewText(e.target.value)}
                        placeholder="Enter text..."
                        className="w-full px-3 py-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] text-sm text-white focus:outline-none focus:border-[var(--color-primary)]"
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleAddTextOverlay()
                        }
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddTextOverlay}
                          className="flex-1 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-sm font-medium transition-colors shadow-md shadow-[var(--color-primary)]/20"
                        >
                          Add Text
                        </button>
                        <button
                          onClick={() => setShowAddText(false)}
                          className="flex-1 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-white rounded-lg text-sm transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddText(true)}
                      className="mt-4 w-full py-2.5 border border-dashed border-[var(--color-border)] rounded-xl text-sm font-medium text-[var(--color-muted)] hover:text-white hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-all"
                    >
                      + Add New Text
                    </button>
                  )}
                </div>
              )}

              {/* Info tab */}
              {activeTab === "info" && (
                <div className="space-y-4">
                  <div className="bg-[var(--color-primary)]/10 p-4 rounded-xl border border-[var(--color-primary)]/20 flex flex-col items-center justify-center shadow-lg shadow-[var(--color-primary)]/5">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[var(--color-primary)]/80 mb-1">
                      Engagement Score
                    </span>
                    <span className="text-3xl font-extrabold text-[var(--color-primary)]">
                       {Math.round(clip.engagement_score * 10)}
                    </span>
                    <span className="text-[10px] text-[var(--color-primary)]/60 mt-1 uppercase font-semibold">
                      Out of 100
                    </span>
                  </div>

                  <div className="bg-black/20 p-4 rounded-xl border border-[var(--color-border)]/50 space-y-3">
                     <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">
                       Clip Details
                     </p>
                     <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex justify-between items-center">
                           <span className="text-white/40">Duration</span>
                           <span className="font-mono text-white/90">{Math.round(clip.duration)}s</span>
                        </div>
                        <div className="flex justify-between items-center">
                           <span className="text-white/40">Resolution</span>
                           <span className="font-mono text-white/90">{videoInfo.width}×{videoInfo.height}</span>
                        </div>
                        <div className="col-span-2 flex justify-between items-center">
                           <span className="text-white/40">Range</span>
                           <span className="font-mono text-white/90">{formatTime(clip.start_time)} — {formatTime(clip.end_time)}</span>
                        </div>
                        <div className="col-span-2 pt-2 border-t border-[var(--color-border)]/50">
                           <span className="block text-white/40 mb-1">Source file</span>
                           <span className="text-white/90 break-all text-xs">{videoInfo.filename}</span>
                        </div>
                     </div>
                  </div>

                  {clip.reason && (
                    <div className="bg-black/20 p-4 rounded-xl border border-[var(--color-border)]/50">
                       <p className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">
                         Extraction Reason
                       </p>
                       <p className="text-sm text-white/80 leading-relaxed italic">
                         "{clip.reason}"
                       </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Helper components ──

function TranscriptWords({
  words,
  clipStart,
  clipEnd,
  currentTime,
  onWordClick,
}: {
  words: Array<{ start: number; end: number; word: string }>;
  clipStart: number;
  clipEnd: number;
  currentTime: number;
  onWordClick: (time: number) => void;
}) {
  // Filter words within clip range
  const clipWords = words.filter(
    (w) => w.start >= clipStart - 0.1 && w.end <= clipEnd + 0.1,
  );

  return (
    <div className="text-sm leading-relaxed">
      {clipWords.map((w, i) => {
        const relTime = w.start - clipStart;
        const isActive =
          currentTime >= relTime && currentTime < w.end - clipStart;
        return (
          <span
            key={i}
            onClick={() => onWordClick(relTime)}
            className={`cursor-pointer hover:text-[var(--color-primary)] transition-colors ${
              isActive
                ? "text-[var(--color-primary)] font-semibold bg-[var(--color-primary)]/10 rounded px-0.5"
                : currentTime > w.end - clipStart
                  ? "text-[var(--color-muted)]"
                  : "text-white/80"
            }`}
          >
            {w.word}{" "}
          </span>
        );
      })}
    </div>
  );
}

function TranscriptSegments({
  segments,
  clipStart,
  clipEnd,
  currentTime,
  onSegmentClick,
}: {
  segments: Array<{ start: number; end: number; text: string }>;
  clipStart: number;
  clipEnd: number;
  currentTime: number;
  onSegmentClick: (time: number) => void;
}) {
  const clipSegs = segments.filter(
    (s) => s.start >= clipStart - 0.5 && s.end <= clipEnd + 0.5,
  );

  return (
    <div className="space-y-2">
      {clipSegs.map((seg, i) => {
        const relStart = seg.start - clipStart;
        const relEnd = seg.end - clipStart;
        const isActive = currentTime >= relStart && currentTime < relEnd;
        return (
          <p
            key={i}
            onClick={() => onSegmentClick(relStart)}
            className={`text-sm cursor-pointer hover:text-[var(--color-primary)] transition-colors px-2 py-1 rounded ${
              isActive
                ? "text-white bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]"
                : "text-[var(--color-muted)]"
            }`}
          >
            {seg.text}
          </p>
        );
      })}
    </div>
  );
}

function getCurrentKeyframe(
  track: CropTrack,
  time: number,
): { center_x: number; center_y: number; zoom: number } | null {
  const kfs = track.keyframes;
  if (kfs.length === 0) return null;
  if (kfs.length === 1) return { ...kfs[0], zoom: kfs[0].zoom ?? 1.0 };

  // Find surrounding keyframes and interpolate
  for (let i = 0; i < kfs.length - 1; i++) {
    if (time >= kfs[i].timestamp && time <= kfs[i + 1].timestamp) {
      const t =
        (time - kfs[i].timestamp) /
        (kfs[i + 1].timestamp - kfs[i].timestamp || 1);
      const easedT = t * t * (3 - 2 * t);
      const z0 = kfs[i].zoom ?? 1.0;
      const z1 = kfs[i + 1].zoom ?? 1.0;
      return {
        center_x:
          kfs[i].center_x + (kfs[i + 1].center_x - kfs[i].center_x) * easedT,
        center_y:
          kfs[i].center_y + (kfs[i + 1].center_y - kfs[i].center_y) * easedT,
        zoom: z0 + (z1 - z0) * easedT,
      };
    }
  }

  // Beyond last keyframe
  const last = kfs[kfs.length - 1];
  return { ...last, zoom: last.zoom ?? 1.0 };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
