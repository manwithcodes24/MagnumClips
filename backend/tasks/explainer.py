from __future__ import annotations

from datetime import datetime, timezone
import traceback

from celery_app import celery_app
from database import SessionLocal
from models.db_models import (
    ExplainerClip,
    ExplainerEdit,
    ExplainerJob,
    ExplainerProject,
    ExplainerScene,
    Transcript,
)
from services.explainer_planner import build_draft_plan
from services.hyperframes_renderer import render_explainer_clip
from services.prompt_editor import apply_prompt_to_scenes
from services.source_assets import select_light_source_assets
from services.tts import synthesize_voiceover


def _finish_job(job: ExplainerJob, status: str, stage: str, progress: float = 100, error: str | None = None):
    job.status = status
    job.stage = stage
    job.progress = progress
    job.error = error
    job.finished_at = datetime.now(timezone.utc)


@celery_app.task(bind=True)
def generate_explainer_draft(self, project_id: str, job_id: str):
    session = SessionLocal()
    try:
        job = session.query(ExplainerJob).filter(ExplainerJob.id == job_id).first()
        project = session.query(ExplainerProject).filter(ExplainerProject.id == project_id).first()
        if not job or not project:
            return

        job.stage = "Analyzing source..."
        job.progress = 20
        session.commit()

        transcript_text = None
        if project.video_id:
            transcript = session.query(Transcript).filter(Transcript.video_id == project.video_id).first()
            if transcript:
                transcript_text = transcript.text

        plan = build_draft_plan(project.prompt, transcript_text, project.config_json or {})
        project.theme_json = plan["theme"]
        project.script_plan_json = plan
        project.status = "ready"

        session.query(ExplainerScene).filter(
            ExplainerScene.clip_id.in_([c.id for c in project.clips])
        ).delete(synchronize_session=False)
        session.query(ExplainerClip).filter(ExplainerClip.project_id == project.id).delete()
        session.flush()

        for clip_data in plan["clips"]:
            clip = ExplainerClip(
                project_id=project.id,
                index=clip_data["index"],
                title=clip_data["title"],
                topic=clip_data.get("topic"),
                narration=clip_data.get("narration"),
                duration=clip_data.get("duration"),
                status="draft",
                scene_plan_json=clip_data.get("scene_plan") or {},
            )
            session.add(clip)
            session.flush()
            for scene_data in clip_data.get("scenes", []):
                session.add(ExplainerScene(
                    clip_id=clip.id,
                    index=scene_data["index"],
                    start_time=scene_data.get("start_time", 0),
                    end_time=scene_data.get("end_time", 0),
                    narration=scene_data.get("narration"),
                    on_screen_text=scene_data.get("on_screen_text"),
                    visual_spec_json=scene_data.get("visual_spec") or {},
                    assets_json=scene_data.get("assets") or [],
                    style_overrides_json=scene_data.get("style_overrides") or {},
                ))

        _finish_job(job, "done", "Draft ready")
        session.commit()
    except Exception as exc:
        traceback.print_exc()
        session.rollback()
        job = session.query(ExplainerJob).filter(ExplainerJob.id == job_id).first()
        project = session.query(ExplainerProject).filter(ExplainerProject.id == project_id).first()
        if job:
            _finish_job(job, "error", "Draft failed", progress=0, error=str(exc))
        if project:
            project.status = "error"
            project.error = str(exc)
        session.commit()
    finally:
        session.close()


@celery_app.task(bind=True)
def render_explainer_project(self, project_id: str, job_id: str, clip_id: str | None = None):
    session = SessionLocal()
    try:
        job = session.query(ExplainerJob).filter(ExplainerJob.id == job_id).first()
        project = session.query(ExplainerProject).filter(ExplainerProject.id == project_id).first()
        if not job or not project:
            return

        query = session.query(ExplainerClip).filter(ExplainerClip.project_id == project.id)
        if clip_id:
            query = query.filter(ExplainerClip.id == clip_id)
        clips = query.order_by(ExplainerClip.index).all()
        total = max(1, len(clips))

        project.status = "rendering"
        session.commit()

        for i, clip in enumerate(clips):
            job.stage = f"Rendering clip {i + 1} of {total}..."
            job.progress = round((i / total) * 90, 1)
            clip.status = "rendering"
            session.commit()

            scenes = [
                {
                    "id": s.id,
                    "index": s.index,
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                    "narration": s.narration,
                    "on_screen_text": s.on_screen_text,
                    "visual_spec": s.visual_spec_json or {},
                    "assets": s.assets_json or [],
                    "style_overrides": s.style_overrides_json or {},
                }
                for s in sorted(clip.scenes, key=lambda s: s.index)
            ]
            source_assets = select_light_source_assets(project.video_id, scenes)
            audio_path = synthesize_voiceover(
                clip.narration or "",
                f"./storage/explainers/{clip.id}.voice.txt",
                provider=(project.config_json or {}).get("tts_provider", "deepgram"),
                model=(project.config_json or {}).get("tts_model", "aura-2"),
                voice_id=(project.config_json or {}).get("voice_id"),
            )
            payload = {
                "project_id": project.id,
                "clip_id": clip.id,
                "title": clip.title,
                "theme": project.theme_json or {},
                "config": project.config_json or {},
                "audio_path": audio_path,
                "source_assets": source_assets,
                "scenes": scenes,
            }
            result = render_explainer_clip(payload, f"{project.id}_{clip.index}")
            clip.rendered_url = result["rendered_url"]
            clip.thumbnail_url = result["thumbnail_url"]
            clip.status = "done"
            clip.error = None

        project.status = "done"
        _finish_job(job, "done", "Render complete")
        session.commit()
    except Exception as exc:
        traceback.print_exc()
        session.rollback()
        job = session.query(ExplainerJob).filter(ExplainerJob.id == job_id).first()
        project = session.query(ExplainerProject).filter(ExplainerProject.id == project_id).first()
        if job:
            _finish_job(job, "error", "Render failed", progress=0, error=str(exc))
        if project:
            project.status = "error"
            project.error = str(exc)
        session.commit()
    finally:
        session.close()


@celery_app.task(bind=True)
def apply_prompt_edit(self, edit_id: str, job_id: str):
    session = SessionLocal()
    try:
        edit = session.query(ExplainerEdit).filter(ExplainerEdit.id == edit_id).first()
        job = session.query(ExplainerJob).filter(ExplainerJob.id == job_id).first()
        if not edit or not job:
            return
        clip = edit.clip
        project = clip.project
        job.stage = "Applying prompt edit..."
        job.progress = 50
        session.commit()

        scenes = [
            {
                "id": s.id,
                "index": s.index,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "narration": s.narration,
                "on_screen_text": s.on_screen_text,
                "visual_spec": s.visual_spec_json or {},
                "assets": s.assets_json or [],
                "style_overrides": s.style_overrides_json or {},
            }
            for s in sorted(clip.scenes, key=lambda s: s.index)
        ]
        updated, before, after = apply_prompt_to_scenes(
            scenes,
            edit.selection_json or {},
            edit.prompt,
            project.theme_json or {},
        )
        scene_by_id = {s["id"]: s for s in updated}
        for row in clip.scenes:
            data = scene_by_id.get(row.id)
            if data:
                row.on_screen_text = data.get("on_screen_text")
                row.visual_spec_json = data.get("visual_spec") or {}
                row.style_overrides_json = data.get("style_overrides") or {}

        edit.before_json = {"scenes": before}
        edit.after_json = {"scenes": after}
        edit.status = "done"
        _finish_job(job, "done", "Prompt edit applied")
        session.commit()
    except Exception as exc:
        traceback.print_exc()
        session.rollback()
        edit = session.query(ExplainerEdit).filter(ExplainerEdit.id == edit_id).first()
        job = session.query(ExplainerJob).filter(ExplainerJob.id == job_id).first()
        if edit:
            edit.status = "error"
            edit.error = str(exc)
        if job:
            _finish_job(job, "error", "Prompt edit failed", progress=0, error=str(exc))
        session.commit()
    finally:
        session.close()
