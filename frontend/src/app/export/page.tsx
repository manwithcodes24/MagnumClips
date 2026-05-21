"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { exportVideo, getExportStatus, getFileUrl } from "@/lib/api";

export default function ExportPage() {
  const router = useRouter();
  const { videoInfo, config, selectedClipIndex, clips, getEditRequest, reset } =
    useAppStore();

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [eta, setEta] = useState<number | null>(null);

  const clip =
    selectedClipIndex !== null
      ? clips.find((c) => c.index === selectedClipIndex)
      : null;

  useEffect(() => {
    if (!videoInfo || selectedClipIndex === null) {
      router.replace("/");
    }
  }, [videoInfo, selectedClipIndex, router]);

  if (!videoInfo || selectedClipIndex === null || !clip) return null;

  const handleExport = async () => {
    setExporting(true);
    setError("");
    setProgress(10);
    setStage("Starting export...");

    try {
      const edits = getEditRequest();
      await exportVideo(videoInfo.id, selectedClipIndex, edits, config);

      // Poll for export status
      const poll = setInterval(async () => {
        try {
          const status = await getExportStatus(videoInfo.id, selectedClipIndex);
          if (status.stage) setStage(status.stage);

          // Use real progress from backend
          if (status.progress != null) {
            setProgress(Math.round(status.progress));
          }
          if (status.eta_seconds != null) {
            setEta(status.eta_seconds);
          } else {
            setEta(null);
          }

          if (status.status === "done" && status.download_url) {
            clearInterval(poll);
            setProgress(100);
            setDownloadUrl(getFileUrl(status.download_url));
            setExporting(false);
          } else if (status.status === "error") {
            clearInterval(poll);
            setError(status.error || "Export failed");
            setProgress(0);
            setExporting(false);
          }
        } catch {
          // ignore transient poll errors
        }
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      setError(msg);
      setProgress(0);
      setExporting(false);
    }
  };

  const handleStartOver = () => {
    reset();
    router.push("/");
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-3xl font-bold mb-2">
          <span className="text-[var(--color-primary)]">Export</span> Video
        </h1>
        <p className="text-[var(--color-muted)] mb-8">{clip.title}</p>

        {/* Status card */}
        <div className="bg-[var(--color-surface)] rounded-xl p-8 border border-[var(--color-border)]">
          {!downloadUrl && !exporting && !error && (
            <>
              {/* Summary */}
              <div className="text-left mb-6 space-y-2 text-sm text-[var(--color-muted)]">
                <p>
                  <span className="text-white">Captions:</span>{" "}
                  {config.captions_enabled
                    ? `${config.caption_style.replace("_", " ")} — ${config.caption_font}`
                    : "Disabled"}
                </p>
                <p>
                  <span className="text-white">Color Grade:</span>{" "}
                  {config.color_grade_enabled
                    ? config.color_grade_preset
                    : "None"}
                </p>
                <p>
                  <span className="text-white">Reframe:</span>{" "}
                  {config.reframe_enabled
                    ? config.target_aspect_ratio
                    : "Disabled"}
                </p>
                <p>
                  <span className="text-white">Duration:</span>{" "}
                  {Math.round(clip.duration)}s
                </p>
              </div>
              <button
                onClick={handleExport}
                className="w-full py-4 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium text-lg transition-colors"
              >
                Start Export
              </button>
            </>
          )}

          {exporting && (
            <div>
              <div className="w-16 h-16 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
              <p className="text-lg font-medium mb-4">
                {stage || "Exporting..."}
              </p>
              <div className="w-full h-3 bg-[var(--color-background)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--color-primary)] transition-all duration-500 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-[var(--color-muted)] mt-2">
                {progress}%{eta != null && eta > 0 ? ` — ~${eta}s remaining` : ""}
              </p>
            </div>
          )}

          {downloadUrl && (
            <div>
              <div className="text-5xl mb-4">✅</div>
              <p className="text-xl font-medium mb-6">Export Complete!</p>
              <a
                href={downloadUrl}
                download
                className="inline-block w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-lg transition-colors mb-3"
              >
                Download MP4
              </a>
              <button
                onClick={() => router.push("/editor")}
                className="w-full py-3 border border-[var(--color-border)] text-[var(--color-muted)] hover:text-white rounded-lg text-sm transition-colors"
              >
                ← Back to Editor
              </button>
            </div>
          )}

          {error && (
            <div>
              <div className="text-5xl mb-4">❌</div>
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={handleExport}
                className="w-full py-3 bg-[var(--color-primary)] text-white rounded-lg font-medium transition-colors"
              >
                Retry Export
              </button>
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={() => router.push("/clips")}
            className="px-6 py-3 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-white transition-colors text-sm"
          >
            Edit Another Clip
          </button>
          <button
            onClick={handleStartOver}
            className="px-6 py-3 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-white transition-colors text-sm"
          >
            New Video
          </button>
        </div>
      </div>
    </main>
  );
}
