"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import {
  ingestYouTube,
  ingestUpload,
  listVideos,
  listJobs,
  deleteVideo,
  getFileUrl,
} from "@/lib/api";
import type { VideoHistoryItem, JobInfo } from "@/lib/api";
import Link from "next/link";
import { AuroraBackground } from "./ui/aurora-background";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AppHome() {
  const router = useRouter();
  const { setVideoInfo, isLoading, setIsLoading, setLoadingMessage } =
    useAppStore();
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<VideoHistoryItem[]>([]);
  const [jobs, setJobs] = useState<JobInfo[]>([]);

  useEffect(() => {
    listVideos()
      .then(setHistory)
      .catch(() => {});
    listJobs()
      .then(setJobs)
      .catch(() => {});
  }, []);

  const handleYouTubeSubmit = async () => {
    if (!youtubeUrl.trim()) return;
    setError("");
    setIsLoading(true);
    setLoadingMessage("Downloading YouTube video...");
    try {
      const info = await ingestYouTube(youtubeUrl.trim());
      setVideoInfo(info);
      router.push("/config");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to download video";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setError("");
    setIsLoading(true);
    setLoadingMessage("Uploading video...");
    try {
      const info = await ingestUpload(file);
      setVideoInfo(info);
      router.push("/config");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload video";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleDelete = async (e: React.MouseEvent, videoId: string) => {
    e.stopPropagation();
    try {
      await deleteVideo(videoId);
      setHistory((prev) => prev.filter((v) => v.id !== videoId));
    } catch {
      // ignore
    }
  };

  const selectHistoryVideo = (video: VideoHistoryItem) => {
    setVideoInfo({
      id: video.id,
      filename: video.filename,
      duration: video.duration,
      width: video.width,
      height: video.height,
      thumbnail_url: video.thumbnail_url,
    });
    router.push("/config");
  };

  const resumeJob = (job: JobInfo) => {
    if (job.video) {
      setVideoInfo({
        id: job.video.id,
        filename: job.video.filename,
        duration: job.video.duration,
        width: job.video.width,
        height: job.video.height,
        thumbnail_url: job.video.thumbnail_url,
      });
    } else {
      setVideoInfo({
        id: job.video_id,
        filename: "Unknown",
        duration: 0,
        width: 0,
        height: 0,
        thumbnail_url: null,
      });
    }
    if (job.status === "done") {
      router.push(`/clips?videoId=${job.video_id}`);
    } else {
      router.push(`/analyze?videoId=${job.video_id}`);
    }
  };

  return (
    <AuroraBackground className="flex-1 w-full">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 w-full z-10 relative">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-3">
          <span className="text-[var(--color-primary)]">Magnum</span>Clips
        </h1>
        <p className="text-[var(--color-muted)] text-lg">
          AI-powered clip detection from long videos
        </p>
        <Link
          href="/history"
          className="inline-block mt-4 text-sm text-[var(--color-primary)] hover:underline"
        >
          View Clip History →
        </Link>
      </div>

      {/* Main card */}
      <div className="w-full max-w-2xl space-y-8">
        {/* YouTube URL input */}
        <div className="bg-white/40 dark:bg-white/5 backdrop-blur-2xl rounded-2xl p-6 border border-white/40 dark:border-white/10 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]">
          <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
            YouTube URL
          </label>
          <div className="flex gap-3">
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 px-4 py-3 rounded-xl bg-white/50 dark:bg-black/20 border border-black/10 dark:border-white/10 text-[var(--color-foreground)] placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              onKeyDown={(e) => e.key === "Enter" && handleYouTubeSubmit()}
              disabled={isLoading}
            />
            <button
              onClick={handleYouTubeSubmit}
              disabled={isLoading || !youtubeUrl.trim()}
              className="px-6 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-xl font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Loading..." : "Process"}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
          <span className="text-[var(--color-muted)] text-sm font-medium">OR</span>
          <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
        </div>

        {/* File upload drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`bg-white/40 dark:bg-white/5 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] rounded-2xl p-12 border-2 border-dashed transition-all text-center cursor-pointer ${
            dragOver
              ? "border-[var(--color-primary)] bg-white/60 dark:bg-white/10 scale-[1.02]"
              : "border-black/20 dark:border-white/20 hover:border-black/40 dark:hover:border-white/40"
          }`}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <div className="text-4xl mb-4">📁</div>
          <p className="text-lg font-medium mb-1">
            Drop a video file here or click to browse
          </p>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Supports MP4, MOV, MKV, WEBM
          </p>
          <input
            id="file-input"
            type="file"
            accept="video/mp4,video/mov,video/mkv,video/webm"
            onChange={handleFileInput}
            className="hidden"
            disabled={isLoading}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="text-center text-[var(--color-muted)]">
            <div className="inline-block w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-3" />
            <p>{useAppStore.getState().loadingMessage}</p>
          </div>
        )}
      </div>

      {/* Active Jobs */}
      {jobs.filter((j) => j.status === "running" || j.status === "error")
        .length > 0 && (
        <div className="w-full max-w-2xl mt-12">
          <h2 className="text-lg font-semibold mb-4 text-[var(--color-muted)]">
            Processing
          </h2>
          <div className="space-y-3">
            {jobs
              .filter((j) => j.status === "running" || j.status === "error")
              .map((job) => (
                <button
                  key={job.video_id}
                  onClick={() => resumeJob(job)}
                  className="w-full flex items-center gap-4 bg-white/40 dark:bg-white/5 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] rounded-2xl p-4 border border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30 transition-all text-left group"
                >
                  {/* Status indicator */}
                  <div className="flex-shrink-0">
                    {job.status === "running" ? (
                      <div className="w-10 h-10 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-lg">
                        ✕
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
                      {job.video?.filename ||
                        (job.video?.source === "youtube" &&
                          job.video?.source_url) ||
                        job.video_id}
                    </p>
                    <p className="text-xs text-[var(--color-muted)] mt-1">
                      {job.status === "running"
                        ? job.stage || "Processing..."
                        : job.error || "Failed"}
                    </p>
                  </div>
                  {/* Arrow */}
                  <span className="text-[var(--color-muted)] text-lg flex-shrink-0">
                    →
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Recent Videos */}
      {history.length > 0 && (
        <div className="w-full max-w-2xl mt-12">
          <h2 className="text-lg font-semibold mb-4 text-[var(--color-muted)]">
            Recent Videos
          </h2>
          <div className="space-y-3">
            {history.map((video) => (
              <button
                key={video.id}
                onClick={() => selectHistoryVideo(video)}
                className="w-full flex items-center gap-4 bg-white/40 dark:bg-white/5 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] rounded-2xl p-4 border border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30 transition-all text-left group"
              >
                {/* Thumbnail */}
                <div className="w-24 h-14 rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 flex-shrink-0 flex items-center justify-center">
                  {video.thumbnail_url ? (
                    <img
                      src={getFileUrl(video.thumbnail_url)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--color-muted)] text-xl">
                      🎬
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-foreground)] truncate">
                    {video.source === "youtube" && video.source_url
                      ? video.source_url
                      : video.filename}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-[var(--color-muted)] mt-1">
                    <span>
                      {video.source === "youtube" ? "YouTube" : "Upload"}
                    </span>
                    <span>{formatDuration(video.duration)}</span>
                    <span>
                      {video.width}x{video.height}
                    </span>
                    <span>{timeAgo(video.created_at)}</span>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleDelete(e, video.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        handleDelete(
                          e as unknown as React.MouseEvent,
                          video.id,
                        );
                    }}
                    className="text-[var(--color-muted)] hover:text-red-400 transition-colors p-1 rounded"
                    title="Remove from recents"
                  >
                    ✕
                  </span>
                  <span className="text-[var(--color-muted)] text-lg">→</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      </div>
    </AuroraBackground>
  );
}
