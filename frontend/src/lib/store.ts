import { create } from "zustand";
import type {
  VideoInfo,
  VideoConfig,
  ClipResult,
  TextOverlay,
  EditRequest,
  CropTrack,
  TranscriptData,
} from "@/lib/api";
import { DEFAULT_CONFIG } from "@/lib/api";

interface AppState {
  // Video
  videoInfo: VideoInfo | null;
  setVideoInfo: (info: VideoInfo | null) => void;

  // Config
  config: VideoConfig;
  setConfig: (config: VideoConfig) => void;
  updateConfig: (partial: Partial<VideoConfig>) => void;

  // Clips
  clips: ClipResult[];
  setClips: (clips: ClipResult[]) => void;
  selectedClipIndex: number | null;
  setSelectedClipIndex: (index: number | null) => void;

  // Editor
  trimStart: number | null;
  trimEnd: number | null;
  setTrimStart: (v: number | null) => void;
  setTrimEnd: (v: number | null) => void;
  textOverlays: TextOverlay[];
  addTextOverlay: (overlay: TextOverlay) => void;
  removeTextOverlay: (index: number) => void;
  updateTextOverlay: (index: number, overlay: Partial<TextOverlay>) => void;

  // Loading states
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  loadingMessage: string;
  setLoadingMessage: (msg: string) => void;

  // Export
  exportUrl: string | null;
  setExportUrl: (url: string | null) => void;

  // Reframe
  cropTrack: CropTrack | null;
  setCropTrack: (track: CropTrack | null) => void;
  transcript: TranscriptData | null;
  setTranscript: (data: TranscriptData | null) => void;
  reframeLoading: boolean;
  setReframeLoading: (v: boolean) => void;

  // Get edit request
  getEditRequest: () => EditRequest;

  // Reset
  reset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  videoInfo: null,
  setVideoInfo: (info) => set({ videoInfo: info }),

  config: DEFAULT_CONFIG,
  setConfig: (config) => set({ config }),
  updateConfig: (partial) =>
    set((state) => ({ config: { ...state.config, ...partial } })),

  clips: [],
  setClips: (clips) => set({ clips }),
  selectedClipIndex: null,
  setSelectedClipIndex: (index) => set({ selectedClipIndex: index }),

  trimStart: null,
  trimEnd: null,
  setTrimStart: (v) => set({ trimStart: v }),
  setTrimEnd: (v) => set({ trimEnd: v }),
  textOverlays: [],
  addTextOverlay: (overlay) =>
    set((state) => ({ textOverlays: [...state.textOverlays, overlay] })),
  removeTextOverlay: (index) =>
    set((state) => ({
      textOverlays: state.textOverlays.filter((_, i) => i !== index),
    })),
  updateTextOverlay: (index, overlay) =>
    set((state) => ({
      textOverlays: state.textOverlays.map((o, i) =>
        i === index ? { ...o, ...overlay } : o
      ),
    })),

  isLoading: false,
  setIsLoading: (v) => set({ isLoading: v }),
  loadingMessage: "",
  setLoadingMessage: (msg) => set({ loadingMessage: msg }),

  exportUrl: null,
  setExportUrl: (url) => set({ exportUrl: url }),

  cropTrack: null,
  setCropTrack: (track) => set({ cropTrack: track }),
  transcript: null,
  setTranscript: (data) => set({ transcript: data }),
  reframeLoading: false,
  setReframeLoading: (v) => set({ reframeLoading: v }),

  getEditRequest: () => ({
    trim_start: get().trimStart,
    trim_end: get().trimEnd,
    text_overlays: get().textOverlays,
  }),

  reset: () =>
    set({
      videoInfo: null,
      config: DEFAULT_CONFIG,
      clips: [],
      selectedClipIndex: null,
      trimStart: null,
      trimEnd: null,
      textOverlays: [],
      isLoading: false,
      loadingMessage: "",
      exportUrl: null,
      cropTrack: null,
      transcript: null,
      reframeLoading: false,
    }),
}));
