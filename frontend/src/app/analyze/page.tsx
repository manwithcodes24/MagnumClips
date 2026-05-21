"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  analyzeVideo,
  getAnalyzeStatus,
  getAnalyzeStreamUrl,
  getClips,
} from "@/lib/api";

export default function AnalyzePage() {
  return (
    <Suspense fallback={<AnalyzeLoading stage="Starting..." />}>
      <AnalyzeContent />
    </Suspense>
  );
}

function AnalyzeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { videoInfo, setClips } = useAppStore();
  const [stage, setStage] = useState("Starting...");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const urlVideoId = searchParams.get("videoId");
  const videoId = urlVideoId || videoInfo?.id;

  useEffect(() => {
    if (!videoId) {
      router.replace("/");
      return;
    }

    if (!started.current) {
      started.current = true;
      if (!urlVideoId) {
        analyzeVideo(videoId).catch(() => {});
      }
    }

    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const handleDone = async () => {
      const clips = await getClips(videoId);
      setClips(clips);
      router.push("/clips");
    };

    const eventSource = new EventSource(getAnalyzeStreamUrl(videoId));
    let sseConnected = false;

    eventSource.onmessage = (event) => {
      sseConnected = true;
      try {
        const data = JSON.parse(event.data);
        if (data.stage) setStage(data.stage);

        if (data.status === "done") {
          eventSource.close();
          handleDone().catch(() => {});
        } else if (data.status === "error") {
          eventSource.close();
          setError(data.error || "Analysis failed");
        }
      } catch {
        // ignore parse errors
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      if (!sseConnected) {
        pollInterval = setInterval(async () => {
          try {
            const status = await getAnalyzeStatus(videoId);
            if (status.stage) setStage(status.stage);

            if (status.status === "done") {
              clearInterval(pollInterval!);
              await handleDone();
            } else if (status.status === "error") {
              clearInterval(pollInterval!);
              setError(status.error || "Analysis failed");
            }
          } catch {
            // ignore transient poll errors
          }
        }, 2000);
      }
    };

    return () => {
      eventSource.close();
      if (pollInterval) clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, urlVideoId]);

  if (error) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-6">!</div>
          <h1 className="text-2xl font-bold mb-2 text-red-400">
            Analysis Failed
          </h1>
          <p className="text-[var(--color-muted)] text-lg mb-6">{error}</p>
          <button
            onClick={() => router.push("/config")}
            className="px-6 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium transition-colors"
          >
            Back to Config
          </button>
        </div>
      </main>
    );
  }

  return <AnalyzeLoading stage={stage} />;
}

function AnalyzeLoading({ stage }: { stage: string }) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-8" />
        <h1 className="text-2xl font-bold mb-2">Analyzing Video</h1>
        <p className="text-[var(--color-muted)] text-lg">{stage}</p>
        <p className="text-[var(--color-muted)] text-sm mt-4">
          This may take a few minutes depending on video length
        </p>
      </div>
    </main>
  );
}
