# Explainer Clip Generator Implementation Instructions

## Summary
Add a new authenticated "Explainer" flow beside the existing clipper. Users can create explainer clips from a YouTube URL, uploaded media, existing video, or prompt-only input. The system generates an editable script/scene plan, renders one or multiple HyperFrames explainer MP4s with generated voiceover, and opens a dedicated explainer video editor.

The editor shows the rendered explainer with a timeline, scene blocks, trim/text/style tools, and a prompt-based editing panel. Users can select either a scene block or an arbitrary time range, type an edit prompt, and regenerate only that selected part while preserving the rest of the clip's theme, pacing, and visual language.

## Key Changes
- Add explainer backend models:
  - `ExplainerProject`: owner, input type, optional `video_id`, prompt, config, global style/theme tokens, script plan, status.
  - `ExplainerClip`: project, index, title/topic, narration script, scene plan, rendered URL, thumbnail URL, status.
  - `ExplainerScene`: clip, scene index, start/end, narration text, on-screen text, visual spec, style tokens, asset references.
  - `ExplainerEdit`: clip, selected scene or time range, user prompt, before/after scene JSON, status, error.
  - `ExplainerJob`: draft/render/edit job status, stage, progress, Celery task id.

- Add `/api/explainer` routes:
  - `POST /projects`: create project from prompt, YouTube, upload-derived `video_id`, or existing `video_id`.
  - `POST /projects/{id}/draft`: analyze source and generate editable clip/scene plan.
  - `PUT /projects/{id}/script-plan`: save user edits before render.
  - `POST /projects/{id}/render`: render selected/all explainer clips.
  - `GET /projects/{id}` and `GET /projects/{id}/jobs/latest`: load project/progress.
  - `GET /clips/{clip_id}`: load rendered clip, scenes, edits.
  - `POST /clips/{clip_id}/prompt-edit`: submit prompt-based edit for `scene_ids` or `{start_time,end_time}`.
  - `POST /clips/{clip_id}/render-edits`: re-render the affected clip after accepted edits.

- Add explainer generation services:
  - `explainer_planner`: Gemini planner that returns structured clips/scenes, narration, visual specs, and global theme tokens.
  - `tts`: provider abstraction with Deepgram Aura-2 default, Deepgram Aura-1 budget, and ElevenLabs premium.
  - `hyperframes_renderer`: writes HyperFrames compositions from scene JSON and renders MP4s.
  - `prompt_editor`: applies user prompt only to selected scene/time-range scene specs, preserving project theme tokens and neighboring scene continuity.
  - `source_assets`: extracts light supporting stills/snippets from YouTube/uploaded videos only when useful.

- Use Celery for all long-running explainer work:
  - Draft generation, TTS generation, HyperFrames render, and prompt-edit re-render jobs run in `tasks.explainer`.
  - Jobs update DB progress for polling.
  - Failed scene edits do not corrupt the last successful rendered clip.

## Editor UX
- Add `/explainer`:
  - Prompt, YouTube URL, upload, and existing video entry points.
  - Voice provider/model controls.
  - Clip mode controls for single or multiple topic clips.

- Add `/explainer/[projectId]/review`:
  - Shows generated clips, scenes, narration, visual plan, voice provider/model, and render button.
  - User can edit script/scene text before first render.

- Add `/explainer/editor/[clipId]`:
  - Video preview with play/pause/seek.
  - Timeline with scene blocks and draggable time-range selection.
  - Scene panel: reorder, delete, duplicate, trim scene start/end, edit on-screen text.
  - Text overlay tools: add/edit/delete, position, color, scale, stroke.
  - Style tools: caption toggle/style, global color/theme preset, aspect ratio locked to generated clip.
  - Prompt-based edit panel:
    - Selection mode: scene block or arbitrary time range.
    - Prompt input such as "Change this section to explain it with a comparison chart."
    - Preview diff: old/new scene spec and affected duration.
    - Apply: saves modified scene JSON and re-renders only the affected clip output.

## Prompt-Based Editing Behavior
- Default scope is visuals and on-screen text.
- Narration audio remains stable unless the user explicitly requests narration wording changes.
- For arbitrary time ranges, map the range to overlapping scenes, split boundary scenes if needed, then regenerate only those scene specs.
- Preserve global theme tokens: palette, typography, motion style, caption style, visual density, and pacing.
- Preserve source truth for video-based explainers; prompt edits cannot introduce claims unsupported by the analyzed source unless clearly framed as user-provided context.

## Public Types
- `ExplainerConfig`: `clip_mode`, `max_clips`, `target_duration_seconds`, `aspect_ratio`, `visual_style`, `source_visual_usage`, `tts_provider`, `tts_model`, `voice_id`.
- `ExplainerScene`: `id`, `index`, `start_time`, `end_time`, `narration`, `on_screen_text`, `visual_spec`, `assets`, `style_overrides`.
- `PromptEditRequest`: `{ selection: {scene_ids?: string[], start_time?: number, end_time?: number}, prompt: string, scope: "visuals_text" }`.
- `PromptEditResult`: affected scenes, before/after specs, status, render job id.

## Test Plan
- Backend:
  - Create explainer projects from prompt and existing video.
  - Draft generation stores structured clips/scenes and global theme tokens.
  - Prompt edit with scene selection changes only selected scenes.
  - Prompt edit with time range maps/splits affected scenes correctly.
  - Prompt edit preserves required theme fields and leaves unrelated scenes unchanged.
  - Mock TTS/HyperFrames render and verify final URLs/thumbnails persist.
  - Auth tests prevent users from reading/editing another user's project.

- Frontend:
  - Review page edits script plan and starts render.
  - Editor loads rendered clip and scene timeline.
  - Scene selection and arbitrary range selection both populate the prompt edit panel.
  - Text/style tools update local scene/overlay state.
  - Prompt edit shows progress, then updates preview/output URL.
  - Failed prompt edit shows error without losing previous rendered version.

## Assumptions
- V1 uses HyperFrames motion graphics, not HeyGen avatar presenter videos.
- V1 does not include Chatterbox/local TTS.
- Deepgram Aura-2 is the default cheap quality TTS option; ElevenLabs remains selectable as premium.
- Source video snippets/stills are used lightly and only when they improve explanation.
- Prompt-based edits target visuals and on-screen text by default; narration changes require explicit user wording.
- Explainer renders count against the existing monthly export quota in v1.
