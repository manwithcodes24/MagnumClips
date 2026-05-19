from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import CurrentUser, get_current_user
from database import get_db
from models.db_models import (
    ExplainerClip,
    ExplainerEdit,
    ExplainerJob,
    ExplainerProject,
    ExplainerScene,
    Video,
)
from models.schemas import (
    ExplainerClipSchema,
    ExplainerJobResponse,
    ExplainerProjectCreate,
    ExplainerProjectResponse,
    ExplainerSceneSchema,
    ExplainerScriptPlanUpdate,
    PromptEditRequest,
    PromptEditResponse,
)

router = APIRouter(prefix="/api/explainer", tags=["explainer"])


def _get_project(project_id: str, user_id: str, db: Session) -> ExplainerProject:
    project = db.query(ExplainerProject).filter(
        ExplainerProject.id == project_id,
        ExplainerProject.user_id == user_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Explainer project not found")
    return project


def _get_clip(clip_id: str, user_id: str, db: Session) -> ExplainerClip:
    clip = db.query(ExplainerClip).join(ExplainerProject).filter(
        ExplainerClip.id == clip_id,
        ExplainerProject.user_id == user_id,
    ).first()
    if not clip:
        raise HTTPException(status_code=404, detail="Explainer clip not found")
    return clip


def _scene_to_schema(scene: ExplainerScene) -> ExplainerSceneSchema:
    return ExplainerSceneSchema(
        id=scene.id,
        index=scene.index,
        start_time=scene.start_time,
        end_time=scene.end_time,
        narration=scene.narration,
        on_screen_text=scene.on_screen_text,
        visual_spec=scene.visual_spec_json or {},
        assets=scene.assets_json or [],
        style_overrides=scene.style_overrides_json or {},
    )


def _clip_to_schema(clip: ExplainerClip) -> ExplainerClipSchema:
    return ExplainerClipSchema(
        id=clip.id,
        index=clip.index,
        title=clip.title,
        topic=clip.topic,
        narration=clip.narration,
        duration=clip.duration,
        status=clip.status,
        scene_plan=clip.scene_plan_json or {},
        scenes=[_scene_to_schema(s) for s in sorted(clip.scenes, key=lambda s: s.index)],
        rendered_url=clip.rendered_url,
        thumbnail_url=clip.thumbnail_url,
        error=clip.error,
    )


def _project_to_response(project: ExplainerProject) -> ExplainerProjectResponse:
    return ExplainerProjectResponse(
        id=project.id,
        input_type=project.input_type,
        video_id=project.video_id,
        source_url=project.source_url,
        prompt=project.prompt,
        status=project.status,
        config=project.config_json or {},
        theme=project.theme_json or {},
        script_plan=project.script_plan_json,
        clips=[_clip_to_schema(c) for c in sorted(project.clips, key=lambda c: c.index)],
        error=project.error,
    )


def _job_to_response(job: ExplainerJob) -> ExplainerJobResponse:
    return ExplainerJobResponse(
        id=job.id,
        project_id=job.project_id,
        clip_id=job.clip_id,
        job_type=job.job_type,
        status=job.status,
        stage=job.stage,
        progress=job.progress,
        error=job.error,
    )


def _enqueue_task(task_name: str, *args):
    if task_name == "draft":
        from tasks.explainer import generate_explainer_draft
        return generate_explainer_draft.delay(*args)
    if task_name == "render":
        from tasks.explainer import render_explainer_project
        return render_explainer_project.delay(*args)
    if task_name == "prompt_edit":
        from tasks.explainer import apply_prompt_edit
        return apply_prompt_edit.delay(*args)
    raise ValueError(f"Unknown task: {task_name}")


@router.post("/projects", response_model=ExplainerProjectResponse)
async def create_project(
    req: ExplainerProjectCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    if req.video_id:
        video = db.query(Video).filter(
            Video.id == req.video_id,
            Video.user_id == current_user.id,
        ).first()
        if not video:
            raise HTTPException(status_code=404, detail="Source video not found")

    project = ExplainerProject(
        user_id=current_user.id,
        input_type=req.input_type,
        video_id=req.video_id,
        source_url=req.source_url,
        prompt=req.prompt,
        config_json=req.config.model_dump(),
        theme_json={},
        status="draft",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_to_response(project)


@router.get("/projects/{project_id}", response_model=ExplainerProjectResponse)
async def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    return _project_to_response(_get_project(project_id, current_user.id, db))


@router.post("/projects/{project_id}/draft", response_model=ExplainerJobResponse)
async def start_draft(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    project = _get_project(project_id, current_user.id, db)
    job = ExplainerJob(project_id=project.id, job_type="draft", status="running", stage="Queued", progress=0)
    project.status = "planning"
    db.add(job)
    db.commit()
    db.refresh(job)

    task = _enqueue_task("draft", project.id, job.id)
    job.celery_task_id = task.id
    db.commit()
    return _job_to_response(job)


@router.get("/projects/{project_id}/jobs/latest", response_model=ExplainerJobResponse)
async def latest_job(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    project = _get_project(project_id, current_user.id, db)
    job = db.query(ExplainerJob).filter(
        ExplainerJob.project_id == project.id,
    ).order_by(ExplainerJob.started_at.desc()).first()
    if not job:
        raise HTTPException(status_code=404, detail="No jobs found")
    return _job_to_response(job)


@router.put("/projects/{project_id}/script-plan", response_model=ExplainerProjectResponse)
async def update_script_plan(
    project_id: str,
    req: ExplainerScriptPlanUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    project = _get_project(project_id, current_user.id, db)
    project.script_plan_json = req.script_plan
    project.status = "ready"

    db.query(ExplainerScene).filter(
        ExplainerScene.clip_id.in_([c.id for c in project.clips])
    ).delete(synchronize_session=False)
    db.query(ExplainerClip).filter(ExplainerClip.project_id == project.id).delete()

    for clip_data in req.clips:
        clip = ExplainerClip(
            project_id=project.id,
            index=clip_data.index,
            title=clip_data.title,
            topic=clip_data.topic,
            narration=clip_data.narration,
            duration=clip_data.duration,
            status=clip_data.status,
            scene_plan_json=clip_data.scene_plan,
        )
        db.add(clip)
        db.flush()
        for scene_data in clip_data.scenes:
            db.add(ExplainerScene(
                clip_id=clip.id,
                index=scene_data.index,
                start_time=scene_data.start_time,
                end_time=scene_data.end_time,
                narration=scene_data.narration,
                on_screen_text=scene_data.on_screen_text,
                visual_spec_json=scene_data.visual_spec,
                assets_json=scene_data.assets,
                style_overrides_json=scene_data.style_overrides,
            ))

    db.commit()
    db.refresh(project)
    return _project_to_response(project)


@router.post("/projects/{project_id}/render", response_model=ExplainerJobResponse)
async def start_render(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    project = _get_project(project_id, current_user.id, db)
    if not project.clips:
        raise HTTPException(status_code=400, detail="Generate or save a script plan before rendering")
    job = ExplainerJob(project_id=project.id, job_type="render", status="running", stage="Queued", progress=0)
    project.status = "rendering"
    db.add(job)
    db.commit()
    db.refresh(job)

    task = _enqueue_task("render", project.id, job.id)
    job.celery_task_id = task.id
    db.commit()
    return _job_to_response(job)


@router.get("/projects/{project_id}/clips", response_model=list[ExplainerClipSchema])
async def list_project_clips(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    project = _get_project(project_id, current_user.id, db)
    return [_clip_to_schema(c) for c in sorted(project.clips, key=lambda c: c.index)]


@router.get("/clips/{clip_id}", response_model=ExplainerClipSchema)
async def get_clip(
    clip_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    return _clip_to_schema(_get_clip(clip_id, current_user.id, db))


@router.post("/clips/{clip_id}/prompt-edit", response_model=PromptEditResponse)
async def prompt_edit(
    clip_id: str,
    req: PromptEditRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    clip = _get_clip(clip_id, current_user.id, db)
    edit = ExplainerEdit(
        clip_id=clip.id,
        selection_json=req.selection.model_dump(exclude_none=True),
        prompt=req.prompt,
        scope=req.scope,
        status="pending",
    )
    job = ExplainerJob(
        project_id=clip.project_id,
        clip_id=clip.id,
        job_type="prompt_edit",
        status="running",
        stage="Queued",
        progress=0,
    )
    db.add(edit)
    db.add(job)
    db.commit()
    db.refresh(edit)
    db.refresh(job)

    task = _enqueue_task("prompt_edit", edit.id, job.id)
    job.celery_task_id = task.id
    db.commit()
    return PromptEditResponse(
        id=edit.id,
        clip_id=edit.clip_id,
        selection=edit.selection_json,
        prompt=edit.prompt,
        scope=edit.scope,
        status=edit.status,
        before=edit.before_json,
        after=edit.after_json,
        error=edit.error,
    )


@router.post("/clips/{clip_id}/render-edits", response_model=ExplainerJobResponse)
async def render_clip_edits(
    clip_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    clip = _get_clip(clip_id, current_user.id, db)
    job = ExplainerJob(
        project_id=clip.project_id,
        clip_id=clip.id,
        job_type="render",
        status="running",
        stage="Queued",
        progress=0,
    )
    clip.status = "rendering"
    db.add(job)
    db.commit()
    db.refresh(job)
    task = _enqueue_task("render", clip.project_id, job.id, clip.id)
    job.celery_task_id = task.id
    db.commit()
    return _job_to_response(job)
