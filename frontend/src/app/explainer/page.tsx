"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createExplainerProject,
  DEFAULT_EXPLAINER_CONFIG,
  ingestUpload,
  startExplainerDraft,
  type ExplainerConfig,
} from "@/lib/api";

export default function ExplainerPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"prompt" | "youtube" | "upload">("prompt");
  const [prompt, setPrompt] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [config, setConfig] = useState<ExplainerConfig>(DEFAULT_EXPLAINER_CONFIG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const updateConfig = (partial: Partial<ExplainerConfig>) =>
    setConfig((prev) => ({ ...prev, ...partial }));

  const createAndDraft = async (file?: File) => {
    setLoading(true);
    setError("");
    try {
      let project;
      if (mode === "upload") {
        if (!file) throw new Error("Choose a video file first");
        const video = await ingestUpload(file);
        project = await createExplainerProject({
          input_type: "upload",
          video_id: video.id,
          prompt: prompt || undefined,
          config,
        });
      } else if (mode === "youtube") {
        project = await createExplainerProject({
          input_type: "youtube",
          source_url: youtubeUrl,
          prompt: prompt || undefined,
          config,
        });
      } else {
        project = await createExplainerProject({
          input_type: "prompt",
          prompt,
          config,
        });
      }
      await startExplainerDraft(project.id);
      router.push(`/explainer/${project.id}/review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start explainer generation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Explainer Generator</h1>
          <p className="mt-2 text-[var(--color-muted)]">
            Generate narrated motion-graphics clips from a prompt, YouTube video, or uploaded media.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="mb-5 flex flex-wrap gap-2">
            {(["prompt", "youtube", "upload"] as const).map((item) => (
              <button
                key={item}
                onClick={() => setMode(item)}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  mode === item
                    ? "bg-[var(--color-primary)] text-white"
                    : "border border-[var(--color-border)] text-[var(--color-muted)]"
                }`}
              >
                {item === "prompt" ? "Prompt" : item === "youtube" ? "YouTube" : "Upload"}
              </button>
            ))}
          </div>

          {mode === "youtube" && (
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="mb-4 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3"
            />
          )}

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === "prompt"
                ? "What should the explainer clips teach?"
                : "Optional guidance for tone or emphasis..."
            }
            className="min-h-36 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3"
          />

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-[var(--color-muted)]">Clip mode</span>
              <select
                value={config.clip_mode}
                onChange={(e) => updateConfig({ clip_mode: e.target.value as ExplainerConfig["clip_mode"] })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
              >
                <option value="auto_multiple">Multiple topics</option>
                <option value="single">Single explainer</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[var(--color-muted)]">Voice provider</span>
              <select
                value={config.tts_provider}
                onChange={(e) => {
                  const provider = e.target.value as ExplainerConfig["tts_provider"];
                  updateConfig({ tts_provider: provider, tts_model: provider === "deepgram" ? "aura-2" : "eleven_flash_v2_5" });
                }}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
              >
                <option value="deepgram">Deepgram</option>
                <option value="elevenlabs">ElevenLabs</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-[var(--color-muted)]">Voice model</span>
              <select
                value={config.tts_model}
                onChange={(e) => updateConfig({ tts_model: e.target.value as ExplainerConfig["tts_model"] })}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
              >
                {config.tts_provider === "deepgram" ? (
                  <>
                    <option value="aura-2">Aura-2</option>
                    <option value="aura-1">Aura-1 budget</option>
                  </>
                ) : (
                  <>
                    <option value="eleven_flash_v2_5">Flash v2.5</option>
                    <option value="eleven_multilingual_v2">Multilingual v2</option>
                    <option value="eleven_v3">Eleven v3</option>
                  </>
                )}
              </select>
            </label>
          </div>

          {mode === "upload" ? (
            <label className="mt-5 block cursor-pointer rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
              <input
                type="file"
                accept="video/mp4,video/mov,video/mkv,video/webm"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) createAndDraft(file);
                }}
                disabled={loading}
              />
              Drop or choose a video to start
            </label>
          ) : (
            <button
              onClick={() => createAndDraft()}
              disabled={loading || (mode === "prompt" && !prompt.trim()) || (mode === "youtube" && !youtubeUrl.trim())}
              className="mt-5 rounded-lg bg-[var(--color-primary)] px-6 py-3 font-medium text-white disabled:opacity-50"
            >
              {loading ? "Starting..." : "Generate Draft"}
            </button>
          )}

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </main>
  );
}
