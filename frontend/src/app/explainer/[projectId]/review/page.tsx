"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getExplainerProject,
  getLatestExplainerJob,
  renderExplainerProject,
  saveExplainerScriptPlan,
  type ExplainerClip,
  type ExplainerProject,
} from "@/lib/api";

export default function ExplainerReviewPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ExplainerProject | null>(null);
  const [clips, setClips] = useState<ExplainerClip[]>([]);
  const [stage, setStage] = useState("Loading...");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const load = async () => {
      const data = await getExplainerProject(params.projectId);
      setProject(data);
      setClips(data.clips);
      if (data.status === "planning" || data.clips.length === 0) {
        try {
          const job = await getLatestExplainerJob(params.projectId);
          setStage(job.stage || data.status);
        } catch {
          setStage(data.status);
        }
      } else {
        setStage(data.status);
      }
    };
    load().catch(() => setError("Failed to load explainer project"));
    timer = setInterval(() => load().catch(() => {}), 2500);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [params.projectId]);

  const updateClip = (index: number, partial: Partial<ExplainerClip>) => {
    setClips((prev) => prev.map((clip) => (clip.index === index ? { ...clip, ...partial } : clip)));
  };

  const handleRender = async () => {
    if (!project) return;
    setBusy(true);
    setError("");
    try {
      await saveExplainerScriptPlan(project.id, project.script_plan || {}, clips);
      await renderExplainerProject(project.id);
      setStage("Render queued");
    } catch {
      setError("Failed to start render");
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return <main className="flex-1 p-8 text-red-400">{error}</main>;
  }

  if (!project || clips.length === 0) {
    return (
      <main className="flex-1 p-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          <p className="font-medium">Generating explainer draft</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">{stage}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Review Explainer Draft</h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Edit scripts and scene text before rendering.</p>
          </div>
          <button
            onClick={handleRender}
            disabled={busy}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-3 font-medium text-white disabled:opacity-50"
          >
            {busy ? "Saving..." : "Render Explainers"}
          </button>
        </div>

        <div className="space-y-4">
          {clips.map((clip) => (
            <section key={clip.index} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <input
                value={clip.title}
                onChange={(e) => updateClip(clip.index, { title: e.target.value })}
                className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-lg font-semibold"
              />
              <textarea
                value={clip.narration || ""}
                onChange={(e) => updateClip(clip.index, { narration: e.target.value })}
                className="mb-4 min-h-24 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
              <div className="grid gap-3 md:grid-cols-3">
                {clip.scenes.map((scene) => (
                  <div key={scene.index} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3">
                    <p className="mb-2 text-xs uppercase tracking-wide text-[var(--color-muted)]">Scene {scene.index + 1}</p>
                    <p className="text-sm font-medium">{scene.on_screen_text}</p>
                    <p className="mt-2 text-xs text-[var(--color-muted)]">{scene.narration}</p>
                  </div>
                ))}
              </div>
              {clip.rendered_url && clip.id && (
                <button
                  onClick={() => router.push(`/explainer/editor/${clip.id}`)}
                  className="mt-4 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm"
                >
                  Open Editor
                </button>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
