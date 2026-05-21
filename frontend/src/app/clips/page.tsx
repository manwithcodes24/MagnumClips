"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { getFileUrl } from "@/lib/api";

export default function ClipsPage() {
  const router = useRouter();
  const {
    videoInfo,
    clips,
    selectedClipIndex,
    setSelectedClipIndex,
    setTrimStart,
    setTrimEnd,
  } = useAppStore();

  useEffect(() => {
    if (!videoInfo || clips.length === 0) router.replace("/");
  }, [videoInfo, clips, router]);

  if (!videoInfo || clips.length === 0) return null;

  const handleEditClip = (index: number) => {
    setSelectedClipIndex(index);
    const clip = clips.find((c) => c.index === index);
    if (clip) {
      setTrimStart(0);
      setTrimEnd(clip.duration);
    }
    router.push("/editor");
  };

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-bold mb-2">
          <span className="text-[var(--color-primary)]">Detected</span> Clips
        </h1>
        <p className="text-[var(--color-muted)] mb-8">
          {clips.length} clips found — ranked by engagement potential
        </p>

        <div className="space-y-4">
          {clips.map((clip) => (
            <div
              key={clip.index}
              className={`bg-[var(--color-surface)] rounded-xl border transition-colors ${
                selectedClipIndex === clip.index
                  ? "border-[var(--color-primary)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-primary)]/50"
              }`}
            >
              <div className="flex gap-4 p-4">
                {/* Thumbnail */}
                {clip.thumbnail_url && (
                  <img
                    src={getFileUrl(clip.thumbnail_url)}
                    alt={clip.title}
                    className="w-48 h-28 object-cover rounded-lg flex-shrink-0"
                  />
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-lg">{clip.title}</h3>
                      <p className="text-[var(--color-muted)] text-sm mt-1">
                        {clip.reason}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-2xl font-bold text-[var(--color-primary)]">
                        {clip.engagement_score.toFixed(1)}
                      </div>
                      <div className="text-xs text-[var(--color-muted)]">
                        score
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-sm text-[var(--color-muted)]">
                      {formatTime(clip.start_time)} —{" "}
                      {formatTime(clip.end_time)}
                    </span>
                    <span className="text-sm text-[var(--color-muted)]">
                      {Math.round(clip.duration)}s
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 px-4 pb-4">
                {clip.clip_url && (
                  <a
                    href={getFileUrl(clip.clip_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-muted)] hover:text-white transition-colors"
                  >
                    Preview
                  </a>
                )}
                <button
                  onClick={() => handleEditClip(clip.index)}
                  className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Edit & Export
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Back */}
        <div className="mt-8">
          <button
            onClick={() => router.push("/config")}
            className="px-6 py-3 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-white transition-colors"
          >
            ← Re-configure
          </button>
        </div>
      </div>
    </main>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
