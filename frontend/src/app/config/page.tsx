"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { saveConfig, getFileUrl } from "@/lib/api";
import { useEffect } from "react";

export default function ConfigPage() {
  const router = useRouter();
  const { videoInfo, config, updateConfig, setIsLoading, setLoadingMessage } =
    useAppStore();

  useEffect(() => {
    if (!videoInfo) router.replace("/");
  }, [videoInfo, router]);

  if (!videoInfo) return null;

  const handleNext = async () => {
    setIsLoading(true);
    setLoadingMessage("Saving configuration...");
    try {
      await saveConfig(videoInfo.id, config);
      router.push("/analyze");
    } catch {
      alert("Failed to save configuration");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-bold mb-8">
          <span className="text-[var(--color-primary)]">Configure</span> Your
          Clips
        </h1>

        {/* Video info card */}
        <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-[var(--color-border)] mb-8 flex gap-6 items-center">
          {videoInfo.thumbnail_url && (
            <img
              src={getFileUrl(videoInfo.thumbnail_url)}
              alt="Video thumbnail"
              className="w-40 h-24 object-cover rounded-lg"
            />
          )}
          <div>
            <p className="font-medium text-lg">{videoInfo.filename}</p>
            <p className="text-[var(--color-muted)] text-sm">
              {videoInfo.width}×{videoInfo.height} &middot;{" "}
              {formatDuration(videoInfo.duration)}
            </p>
          </div>
        </div>

        {/* Config sections */}
        <div className="space-y-6">
          {/* AI Model */}
          <Section title="AI Model">
            <Select
              value={config.gemini_model}
              onChange={(v) =>
                updateConfig({
                  gemini_model: v as
                    | "gemini-3-flash-preview"
                    | "gemini-3-pro-preview",
                })
              }
              options={[
                {
                  value: "gemini-3-flash-preview",
                  label: "Gemini 3 Flash",
                  desc: "Fast & affordable",
                },
                {
                  value: "gemini-3-pro-preview",
                  label: "Gemini 3 Pro",
                  desc: "Higher quality",
                },
              ]}
            />
          </Section>

          {/* Transcription Provider */}
          <Section title="Transcription">
            <Select
              value={config.transcription_provider}
              onChange={(v) =>
                updateConfig({
                  transcription_provider: v as "whisper" | "gemini" | "local",
                })
              }
              options={[
                {
                  value: "local",
                  label: "Local (faster-whisper)",
                  desc: "Fast, free, runs on your machine",
                },
                {
                  value: "whisper",
                  label: "OpenAI Whisper",
                  desc: "Best word-level timestamps for captions",
                },
                {
                  value: "gemini",
                  label: "Gemini",
                  desc: "No OpenAI key needed, uses selected Gemini model",
                },
              ]}
              label="Provider"
            />
          </Section>

          {/* Clip Settings */}
          <Section title="Clip Detection">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[var(--color-muted)] mb-1">
                  Target Duration (seconds)
                </label>
                <input
                  type="number"
                  min={15}
                  max={120}
                  value={config.target_clip_duration}
                  onChange={(e) =>
                    updateConfig({
                      target_clip_duration: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--color-muted)] mb-1">
                  Number of Clips
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={config.num_clips}
                  onChange={(e) =>
                    updateConfig({ num_clips: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] text-white"
                />
              </div>
            </div>
          </Section>

          {/* Captions */}
          <Section title="Captions">
            <Toggle
              label="Enable Captions"
              checked={config.captions_enabled}
              onChange={(v) => updateConfig({ captions_enabled: v })}
            />
            {config.captions_enabled && (
              <div className="mt-4 space-y-4">
                <Select
                  value={config.caption_font}
                  onChange={(v) =>
                    updateConfig({
                      caption_font: v as
                        | "bold"
                        | "sans"
                        | "serif"
                        | "handwritten",
                    })
                  }
                  options={[
                    { value: "bold", label: "Bold" },
                    { value: "sans", label: "Sans" },
                    { value: "serif", label: "Serif" },
                    { value: "handwritten", label: "Handwritten" },
                  ]}
                  label="Font"
                />
                <Select
                  value={config.caption_position}
                  onChange={(v) =>
                    updateConfig({
                      caption_position: v as "top" | "center" | "bottom",
                    })
                  }
                  options={[
                    { value: "top", label: "Top" },
                    { value: "center", label: "Center" },
                    { value: "bottom", label: "Bottom" },
                  ]}
                  label="Position"
                />
                <Select
                  value={config.caption_style}
                  onChange={(v) =>
                    updateConfig({
                      caption_style: v as "word_by_word" | "full_sentence",
                    })
                  }
                  options={[
                    {
                      value: "word_by_word",
                      label: "Word-by-Word Highlight",
                      desc: "Each word highlights as it's spoken",
                    },
                    {
                      value: "full_sentence",
                      label: "Full Sentence",
                      desc: "Show complete sentences",
                    },
                  ]}
                  label="Style"
                />
              </div>
            )}
          </Section>

          {/* Color Grading */}
          <Section title="Color Grading">
            <Toggle
              label="Enable Auto Color Grade"
              checked={config.color_grade_enabled}
              onChange={(v) => updateConfig({ color_grade_enabled: v })}
            />
            {config.color_grade_enabled && (
              <div className="mt-4">
                <Select
                  value={config.color_grade_preset}
                  onChange={(v) =>
                    updateConfig({
                      color_grade_preset: v as
                        | "none"
                        | "warm"
                        | "cool"
                        | "cinematic"
                        | "vibrant",
                    })
                  }
                  options={[
                    { value: "warm", label: "Warm", desc: "Golden warmth" },
                    { value: "cool", label: "Cool", desc: "Blue tones" },
                    {
                      value: "cinematic",
                      label: "Cinematic",
                      desc: "High contrast, desaturated",
                    },
                    {
                      value: "vibrant",
                      label: "Vibrant",
                      desc: "Boosted saturation",
                    },
                  ]}
                  label="Preset"
                />
              </div>
            )}
          </Section>
          {/* Output Format / Reframe */}
          <Section title="Output Format">
            <Toggle
              label="Enable AI Reframe"
              checked={config.reframe_enabled}
              onChange={(v) => updateConfig({ reframe_enabled: v })}
            />
            {config.reframe_enabled && (
              <div className="mt-4">
                <Select
                  value={config.target_aspect_ratio}
                  onChange={(v) =>
                    updateConfig({
                      target_aspect_ratio: v as "original" | "9:16" | "1:1",
                    })
                  }
                  options={[
                    {
                      value: "9:16",
                      label: "9:16 Portrait",
                      desc: "TikTok, Reels, Shorts",
                    },
                    {
                      value: "1:1",
                      label: "1:1 Square",
                      desc: "Instagram, Facebook",
                    },
                    {
                      value: "original",
                      label: "Original",
                      desc: "Keep source aspect ratio",
                    },
                  ]}
                  label="Target Aspect Ratio"
                />
              </div>
            )}
          </Section>
        </div>

        {/* Actions */}
        <div className="flex justify-between mt-10">
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] hover:text-white transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleNext}
            className="px-8 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg font-medium transition-colors"
          >
            Analyze Video →
          </button>
        </div>
      </div>
    </main>
  );
}

// === Reusable components ===

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--color-surface)] rounded-xl p-6 border border-[var(--color-border)]">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        className={`w-11 h-6 rounded-full relative transition-colors ${
          checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
        }`}
        onClick={() => onChange(!checked)}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5.5" : "translate-x-0.5"
          }`}
        />
      </div>
      <span className="text-sm">{label}</span>
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; desc?: string }[];
  label?: string;
}) {
  return (
    <div>
      {label && (
        <label className="block text-sm text-[var(--color-muted)] mb-1">
          {label}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
              value === opt.value
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/20 text-white"
                : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-primary)]/50"
            }`}
          >
            <span className="font-medium">{opt.label}</span>
            {opt.desc && (
              <span className="block text-xs opacity-70">{opt.desc}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
