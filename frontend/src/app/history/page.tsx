"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { listCompletedVideos, getFileUrl, loadConfig } from "@/lib/api";
import type { CompletedVideo, ClipResult } from "@/lib/api";
import { useAppStore } from "@/lib/store";

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

export default function HistoryPage() {
  const [videos, setVideos] = useState<CompletedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const {
    setVideoInfo,
    setClips,
    setConfig,
    setSelectedClipIndex,
    setTrimStart,
    setTrimEnd,
    setCropTrack,
    reset,
  } = useAppStore();

  const handleEditClip = async (entry: CompletedVideo, clip: ClipResult) => {
    if (!entry.video) return;
    reset();
    setVideoInfo({
      id: entry.video_id,
      filename: entry.video.filename,
      duration: entry.video.duration,
      width: entry.video.width,
      height: entry.video.height,
      thumbnail_url: entry.video.thumbnail_url,
    });
    setClips(entry.clips);
    setCropTrack(null);
    try {
      const cfg = await loadConfig(entry.video_id);
      setConfig(cfg);
    } catch {
      // use default config
    }
    setSelectedClipIndex(clip.index);
    setTrimStart(0);
    setTrimEnd(clip.duration);
    router.push("/editor");
  };

  useEffect(() => {
    listCompletedVideos()
      .then(setVideos)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center text-[var(--color-muted)]">
          <div className="inline-block w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-3" />
          <p>Loading history...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              <span className="text-[var(--color-primary)]">Clip</span> History
            </h1>
            <p className="text-[var(--color-muted)] mt-1">
              {videos.length} processed video{videos.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-muted)] hover:text-white transition-colors"
          >
            ← Home
          </Link>
        </div>

        {videos.length === 0 ? (
          <div className="text-center py-20 text-[var(--color-muted)]">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-lg">No processed videos yet</p>
            <p className="text-sm mt-2">
              Process a video from the{" "}
              <Link
                href="/"
                className="text-[var(--color-primary)] hover:underline"
              >
                homepage
              </Link>{" "}
              to see clips here
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {videos.map((entry) => (
              <section
                key={entry.video_id}
                className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden"
              >
                {/* Video header */}
                <div className="flex items-center gap-4 p-5 border-b border-[var(--color-border)]">
                  {entry.video?.thumbnail_url ? (
                    <img
                      src={getFileUrl(entry.video.thumbnail_url)}
                      alt=""
                      className="w-20 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-12 rounded-lg bg-[var(--color-background)] flex items-center justify-center text-[var(--color-muted)] text-lg flex-shrink-0">
                      🎬
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">
                      {entry.video?.source === "youtube" &&
                      entry.video?.source_url
                        ? entry.video.source_url
                        : entry.video?.filename || entry.video_id}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-[var(--color-muted)] mt-1">
                      {entry.video && (
                        <>
                          <span>
                            {entry.video.source === "youtube"
                              ? "YouTube"
                              : "Upload"}
                          </span>
                          <span>{formatDuration(entry.video.duration)}</span>
                          <span>
                            {entry.video.width}x{entry.video.height}
                          </span>
                          <span>{timeAgo(entry.video.created_at)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-[var(--color-muted)] flex-shrink-0">
                    {entry.clips.length} clip
                    {entry.clips.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Clips grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
                  {entry.clips.map((clip) => (
                    <div
                      key={clip.index}
                      className="rounded-lg border border-[var(--color-border)] overflow-hidden bg-[var(--color-background)] flex flex-col"
                    >
                      {/* Thumbnail */}
                      {clip.thumbnail_url ? (
                        <img
                          src={getFileUrl(clip.thumbnail_url)}
                          alt={clip.title}
                          className="w-full aspect-video object-cover"
                        />
                      ) : (
                        <div className="w-full aspect-video bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-muted)]">
                          🎬
                        </div>
                      )}

                      {/* Clip info */}
                      <div className="p-3 flex-1 flex flex-col">
                        <h3 className="font-medium text-sm leading-tight line-clamp-2">
                          {clip.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-2 text-xs text-[var(--color-muted)]">
                          <span>{Math.round(clip.duration)}s</span>
                          <span>·</span>
                          <span className="text-[var(--color-primary)] font-semibold">
                            {clip.engagement_score.toFixed(1)}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
                          {clip.clip_url && (
                            <>
                              <a
                                href={getFileUrl(clip.clip_url)}
                                download
                                className="flex-1 text-center px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:text-white transition-colors"
                              >
                                Download
                              </a>
                              <button
                                onClick={() => handleEditClip(entry, clip)}
                                className="flex-1 text-center px-3 py-1.5 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-xs font-medium transition-colors"
                              >
                                Edit
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
