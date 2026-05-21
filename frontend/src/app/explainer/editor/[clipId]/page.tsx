"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  getExplainerClip,
  getFileUrl,
  promptEditExplainerClip,
  renderExplainerClipEdits,
  type ExplainerClip,
  type ExplainerScene,
} from "@/lib/api";

export default function ExplainerEditorPage() {
  const params = useParams<{ clipId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [clip, setClip] = useState<ExplainerClip | null>(null);
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(5);
  const [selectionMode, setSelectionMode] = useState<"scene" | "range">("scene");
  const [prompt, setPrompt] = useState("");
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");

  const videoUrl = clip?.rendered_url ? getFileUrl(clip.rendered_url) : null;
  const duration = useMemo(() => {
    if (!clip?.scenes.length) return clip?.duration || 1;
    return Math.max(...clip.scenes.map((scene) => scene.end_time || 0), clip.duration || 1);
  }, [clip]);

  useEffect(() => {
    getExplainerClip(params.clipId)
      .then((data) => {
        setClip(data);
        const first = data.scenes[0];
        if (first?.id) setSelectedSceneIds([first.id]);
        setRangeEnd(Math.min(5, data.duration || 5));
      })
      .catch(() => setError("Failed to load explainer clip"));
  }, [params.clipId]);

  const toggleScene = (scene: ExplainerScene) => {
    const sceneId = scene.id;
    if (!sceneId) return;
    setSelectedSceneIds((prev) =>
      prev.includes(sceneId) ? prev.filter((id) => id !== sceneId) : [...prev, sceneId],
    );
  };

  const applyPromptEdit = async () => {
    if (!clip || !prompt.trim()) return;
    setStage("Applying prompt edit...");
    setError("");
    try {
      const selection =
        selectionMode === "scene"
          ? { scene_ids: selectedSceneIds }
          : { start_time: rangeStart, end_time: rangeEnd };
      await promptEditExplainerClip(clip.id!, selection, prompt);
      await renderExplainerClipEdits(clip.id!);
      const fresh = await getExplainerClip(clip.id!);
      setClip(fresh);
      setPrompt("");
      setStage("Edit queued. Refresh after render completes if the preview has not changed yet.");
    } catch {
      setError("Prompt edit failed");
      setStage("");
    }
  };

  if (error) return <main className="flex-1 p-8 text-red-400">{error}</main>;
  if (!clip) return <main className="flex-1 p-8 text-[var(--color-muted)]">Loading editor...</main>;

  return (
    <main className="flex-1 min-h-0 px-4 py-4">
      <div className="mx-auto flex max-w-7xl gap-4">
        <section className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">{clip.title}</h1>
            <a
              href={videoUrl || "#"}
              download
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
            >
              Download
            </a>
          </div>

          <div className="overflow-hidden rounded-xl bg-black">
            {videoUrl ? (
              <video ref={videoRef} src={videoUrl} controls className="mx-auto max-h-[70vh] w-auto max-w-full" />
            ) : (
              <div className="flex aspect-[9/16] max-h-[70vh] items-center justify-center text-[var(--color-muted)]">
                Render this clip before previewing.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="relative h-14 rounded-lg bg-black/30">
              {clip.scenes.map((scene) => {
                const left = ((scene.start_time || 0) / duration) * 100;
                const width = (((scene.end_time || 0) - (scene.start_time || 0)) / duration) * 100;
                const selected = !!scene.id && selectedSceneIds.includes(scene.id);
                return (
                  <button
                    key={scene.id || scene.index}
                    onClick={() => {
                      setSelectionMode("scene");
                      toggleScene(scene);
                    }}
                    className={`absolute top-2 h-10 rounded border px-2 text-left text-[10px] ${
                      selected ? "border-[var(--color-primary)] bg-[var(--color-primary)]/30" : "border-[var(--color-border)] bg-[var(--color-background)]"
                    }`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 8)}%` }}
                    title={scene.on_screen_text || undefined}
                  >
                    Scene {scene.index + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="w-96 shrink-0 space-y-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="font-semibold">Prompt-Based Editing</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setSelectionMode("scene")}
                className={`rounded-lg px-3 py-2 text-sm ${selectionMode === "scene" ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)]"}`}
              >
                Scene blocks
              </button>
              <button
                onClick={() => setSelectionMode("range")}
                className={`rounded-lg px-3 py-2 text-sm ${selectionMode === "range" ? "bg-[var(--color-primary)] text-white" : "border border-[var(--color-border)]"}`}
              >
                Time range
              </button>
            </div>

            {selectionMode === "range" && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <label>
                  Start
                  <input
                    type="number"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={rangeStart}
                    onChange={(e) => setRangeStart(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1"
                  />
                </label>
                <label>
                  End
                  <input
                    type="number"
                    min={rangeStart}
                    max={duration}
                    step={0.1}
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(Number(e.target.value))}
                    className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1"
                  />
                </label>
              </div>
            )}

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe how this selected part should change while keeping the same theme and flow..."
              className="mt-3 min-h-32 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
            <button
              onClick={applyPromptEdit}
              disabled={!prompt.trim() || (selectionMode === "scene" && selectedSceneIds.length === 0)}
              className="mt-3 w-full rounded-lg bg-[var(--color-primary)] px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              Apply Prompt Edit
            </button>
            {stage && <p className="mt-3 text-xs text-[var(--color-muted)]">{stage}</p>}
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="font-semibold">Scene Tools</h2>
            <div className="mt-3 space-y-2">
              {clip.scenes.map((scene) => (
                <div key={scene.id || scene.index} className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
                  <p className="font-medium">Scene {scene.index + 1}</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {scene.start_time.toFixed(1)}s - {scene.end_time.toFixed(1)}s
                  </p>
                  <p className="mt-2">{scene.on_screen_text}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
