import axios from "axios";
import { supabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_URL,
  timeout: 300000, // 5 min for long operations
});

// Attach Supabase session token to every API request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// === Auth (Supabase) ===

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getMe(): Promise<UserInfo> {
  const res = await api.get("/api/auth/me");
  return res.data;
}

// === Subscription ===

export async function getPlans(): Promise<PlanInfo[]> {
  const res = await api.get("/api/subscription/plans");
  return res.data;
}

export async function getMySubscription(): Promise<SubscriptionInfo> {
  const res = await api.get("/api/subscription/me");
  return res.data;
}

export async function getMyUsage(): Promise<UsageInfo> {
  const res = await api.get("/api/subscription/usage");
  return res.data;
}

// === Ingest ===

export async function ingestYouTube(url: string) {
  const res = await api.post("/api/ingest/youtube", { url });
  return res.data;
}

export async function ingestUpload(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post("/api/ingest/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function listVideos(): Promise<VideoHistoryItem[]> {
  const res = await api.get("/api/ingest/history");
  return res.data;
}

export async function deleteVideo(videoId: string) {
  const res = await api.delete(`/api/ingest/history/${videoId}`);
  return res.data;
}

// === Config ===

export async function saveConfig(videoId: string, config: VideoConfig) {
  const res = await api.post(`/api/video/${videoId}/config`, config);
  return res.data;
}

export async function loadConfig(videoId: string): Promise<VideoConfig> {
  const res = await api.get(`/api/video/${videoId}/config`);
  return res.data;
}

// === Analysis ===

export async function analyzeVideo(videoId: string) {
  const res = await api.post(`/api/video/${videoId}/analyze`);
  return res.data;
}

export async function getAnalyzeStatus(
  videoId: string
): Promise<{ status: string; stage: string | null; error: string | null }> {
  const res = await api.get(`/api/video/${videoId}/analyze/status`);
  return res.data;
}

export async function getClips(videoId: string) {
  const res = await api.get(`/api/video/${videoId}/clips`);
  return res.data;
}

export async function listJobs(): Promise<JobInfo[]> {
  const res = await api.get("/api/video/jobs/active");
  return res.data;
}

export async function listCompletedVideos(): Promise<CompletedVideo[]> {
  const res = await api.get("/api/video/history/completed");
  return res.data;
}

// === Export ===

export async function exportVideo(
  videoId: string,
  clipIndex: number,
  edits: EditRequest,
  config: VideoConfig
) {
  const res = await api.post(`/api/video/${videoId}/export`, {
    video_id: videoId,
    clip_index: clipIndex,
    edits,
    config,
  });
  return res.data;
}

export async function getExportStatus(
  videoId: string,
  clipIndex: number = 0
): Promise<{
  status: string;
  stage: string | null;
  progress: number | null;
  eta_seconds: number | null;
  error: string | null;
  download_url: string | null;
}> {
  const res = await api.get(
    `/api/video/${videoId}/export/status?clip_index=${clipIndex}`
  );
  return res.data;
}

export function getAnalyzeStreamUrl(videoId: string): string {
  return `${API_URL}/api/video/${videoId}/analyze/stream`;
}

export function getFileUrl(path: string) {
  return `${API_URL}${path}`;
}

// === Types ===

export interface UserInfo {
  id: string;
  email: string | null;
  role: string | null;
}

export interface PlanInfo {
  id: string;
  name: string;
  max_videos_per_month: number;
  max_exports_per_month: number;
  max_video_duration_seconds: number;
  max_storage_mb: number;
  price_monthly: number;
  is_active: boolean;
}

export interface SubscriptionInfo {
  id: string;
  user_id: string;
  plan: PlanInfo;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
}

export interface UsageInfo {
  videos_used: number;
  videos_limit: number;
  exports_used: number;
  exports_limit: number;
  max_video_duration_seconds: number;
  plan_name: string;
  is_admin?: boolean;
}

export interface VideoInfo {
  id: string;
  filename: string;
  duration: number;
  width: number;
  height: number;
  thumbnail_url: string | null;
}

export interface VideoHistoryItem extends VideoInfo {
  source: "youtube" | "upload";
  source_url: string | null;
  created_at: string;
}

export interface JobInfo {
  video_id: string;
  status: "running" | "done" | "error";
  stage: string | null;
  error: string | null;
  video: VideoHistoryItem | null;
}

export interface VideoConfig {
  transcription_provider: "whisper" | "gemini" | "local";
  captions_enabled: boolean;
  caption_font: "bold" | "sans" | "serif" | "handwritten";
  caption_position: "top" | "center" | "bottom";
  caption_style: "word_by_word" | "full_sentence";
  color_grade_enabled: boolean;
  color_grade_preset: "none" | "warm" | "cool" | "cinematic" | "vibrant";
  target_clip_duration: number;
  num_clips: number;
  gemini_model: "gemini-3-flash-preview" | "gemini-3-pro-preview";
  reframe_enabled: boolean;
  target_aspect_ratio: "original" | "9:16" | "1:1";
}

export interface ClipResult {
  index: number;
  start_time: number;
  end_time: number;
  duration: number;
  title: string;
  reason: string;
  engagement_score: number;
  thumbnail_url: string | null;
  clip_url: string | null;
}

export interface TextOverlay {
  text: string;
  x: number;
  y: number;
  start_time: number;
  end_time: number;
  font_size: number;
  color: string;
  font: string;
  follow_reframe: boolean;
  scale: number;    // multiplier, 1.0 = normal
  rotation: number; // degrees
  stroke_color: string;
  stroke_width: number;
}

export interface EditRequest {
  trim_start: number | null;
  trim_end: number | null;
  text_overlays: TextOverlay[];
}

export interface CompletedVideo {
  video_id: string;
  video: VideoHistoryItem | null;
  clips: ClipResult[];
}

// === Reframe Types ===

export interface SubjectDetection {
  track_id: number;
  class_id: number;
  class_name: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  timestamp: number;
}

export interface CropKeyframe {
  timestamp: number;
  center_x: number;
  center_y: number;
  zoom?: number;      // 1.0 = default, >1 = zoom in, <1 = zoom out
  subject_id?: number;
}

export interface CropTrack {
  src_width: number;
  src_height: number;
  target_aspect: number;
  target_width: number;
  target_height: number;
  keyframes: CropKeyframe[];
}

export interface AnchorPoint {
  timestamp: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TranscriptData {
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
  words: Array<{ start: number; end: number; word: string }>;
}

// === Reframe API ===

export async function detectSubjects(
  videoId: string,
  clipIndex: number
): Promise<{ subjects: SubjectDetection[] }> {
  const res = await api.get(
    `/api/reframe/${videoId}/clips/${clipIndex}/subjects`
  );
  return res.data;
}

export async function autoTrack(
  videoId: string,
  clipIndex: number,
  targetAspect: string = "9:16",
  subjectId?: number
): Promise<CropTrack> {
  const params: Record<string, string> = { target_aspect: targetAspect };
  if (subjectId !== undefined) params.subject_id = String(subjectId);
  const res = await api.post(
    `/api/reframe/${videoId}/clips/${clipIndex}/auto-track`,
    null,
    { params }
  );
  return res.data;
}

export async function manualTrack(
  videoId: string,
  clipIndex: number,
  anchors: AnchorPoint[],
  targetAspect: string = "9:16"
): Promise<CropTrack> {
  const res = await api.post(
    `/api/reframe/${videoId}/clips/${clipIndex}/manual-track`,
    { anchors },
    { params: { target_aspect: targetAspect } }
  );
  return res.data;
}

export async function getCropTrack(
  videoId: string,
  clipIndex: number
): Promise<CropTrack> {
  const res = await api.get(
    `/api/reframe/${videoId}/clips/${clipIndex}/track`
  );
  return res.data;
}

export async function saveCropTrack(
  videoId: string,
  clipIndex: number,
  track: CropTrack
): Promise<void> {
  await api.put(
    `/api/reframe/${videoId}/clips/${clipIndex}/track`,
    track
  );
}

export async function getTranscript(
  videoId: string
): Promise<TranscriptData> {
  const res = await api.get(`/api/reframe/${videoId}/transcript`);
  return res.data;
}

export const DEFAULT_CONFIG: VideoConfig = {
  transcription_provider: "local",
  captions_enabled: true,
  caption_font: "bold",
  caption_position: "bottom",
  caption_style: "word_by_word",
  color_grade_enabled: false,
  color_grade_preset: "none",
  target_clip_duration: 60,
  num_clips: 3,
  gemini_model: "gemini-3-flash-preview",
  reframe_enabled: false,
  target_aspect_ratio: "original",
};

// === Explainer ===

export interface ExplainerConfig {
  clip_mode: "auto_multiple" | "single";
  max_clips: number;
  target_duration_seconds: number;
  aspect_ratio: "9:16" | "1:1";
  visual_style: "motion_graphics";
  source_visual_usage: "light";
  tts_provider: "deepgram" | "elevenlabs";
  tts_model: "aura-2" | "aura-1" | "eleven_flash_v2_5" | "eleven_multilingual_v2" | "eleven_v3";
  voice_id: string | null;
}

export interface ExplainerScene {
  id?: string;
  index: number;
  start_time: number;
  end_time: number;
  narration: string | null;
  on_screen_text: string | null;
  visual_spec: Record<string, unknown>;
  assets: Array<Record<string, unknown>>;
  style_overrides: Record<string, unknown>;
}

export interface ExplainerClip {
  id?: string;
  index: number;
  title: string;
  topic: string | null;
  narration: string | null;
  duration: number | null;
  status: string;
  scene_plan: Record<string, unknown>;
  scenes: ExplainerScene[];
  rendered_url: string | null;
  thumbnail_url: string | null;
  error: string | null;
}

export interface ExplainerProject {
  id: string;
  input_type: "prompt" | "youtube" | "upload" | "existing_video";
  video_id: string | null;
  source_url: string | null;
  prompt: string | null;
  status: string;
  config: ExplainerConfig;
  theme: Record<string, unknown>;
  script_plan: Record<string, unknown> | null;
  clips: ExplainerClip[];
  error: string | null;
}

export interface ExplainerJob {
  id: string;
  project_id: string;
  clip_id: string | null;
  job_type: "draft" | "render" | "prompt_edit";
  status: string;
  stage: string | null;
  progress: number | null;
  error: string | null;
}

export interface PromptEditSelection {
  scene_ids?: string[];
  start_time?: number;
  end_time?: number;
}

export interface PromptEditResult {
  id: string;
  clip_id: string;
  selection: Record<string, unknown>;
  prompt: string;
  scope: "visuals_text";
  status: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  error: string | null;
}

export const DEFAULT_EXPLAINER_CONFIG: ExplainerConfig = {
  clip_mode: "auto_multiple",
  max_clips: 5,
  target_duration_seconds: 45,
  aspect_ratio: "9:16",
  visual_style: "motion_graphics",
  source_visual_usage: "light",
  tts_provider: "deepgram",
  tts_model: "aura-2",
  voice_id: null,
};

export async function createExplainerProject(req: {
  input_type: "prompt" | "youtube" | "upload" | "existing_video";
  prompt?: string;
  source_url?: string;
  video_id?: string;
  config: ExplainerConfig;
}): Promise<ExplainerProject> {
  const res = await api.post("/api/explainer/projects", req);
  return res.data;
}

export async function getExplainerProject(projectId: string): Promise<ExplainerProject> {
  const res = await api.get(`/api/explainer/projects/${projectId}`);
  return res.data;
}

export async function startExplainerDraft(projectId: string): Promise<ExplainerJob> {
  const res = await api.post(`/api/explainer/projects/${projectId}/draft`);
  return res.data;
}

export async function getLatestExplainerJob(projectId: string): Promise<ExplainerJob> {
  const res = await api.get(`/api/explainer/projects/${projectId}/jobs/latest`);
  return res.data;
}

export async function saveExplainerScriptPlan(
  projectId: string,
  scriptPlan: Record<string, unknown>,
  clips: ExplainerClip[],
): Promise<ExplainerProject> {
  const res = await api.put(`/api/explainer/projects/${projectId}/script-plan`, {
    script_plan: scriptPlan,
    clips,
  });
  return res.data;
}

export async function renderExplainerProject(projectId: string): Promise<ExplainerJob> {
  const res = await api.post(`/api/explainer/projects/${projectId}/render`);
  return res.data;
}

export async function getExplainerClip(clipId: string): Promise<ExplainerClip> {
  const res = await api.get(`/api/explainer/clips/${clipId}`);
  return res.data;
}

export async function promptEditExplainerClip(
  clipId: string,
  selection: PromptEditSelection,
  prompt: string,
): Promise<PromptEditResult> {
  const res = await api.post(`/api/explainer/clips/${clipId}/prompt-edit`, {
    selection,
    prompt,
    scope: "visuals_text",
  });
  return res.data;
}

export async function renderExplainerClipEdits(clipId: string): Promise<ExplainerJob> {
  const res = await api.post(`/api/explainer/clips/${clipId}/render-edits`);
  return res.data;
}
