from __future__ import annotations


def apply_prompt_to_scenes(
    scenes: list[dict],
    selection: dict,
    prompt: str,
    theme: dict,
) -> tuple[list[dict], list[dict], list[dict]]:
    """Apply a prompt edit to selected scene specs.

    Returns (updated_scenes, before, after). The implementation keeps narration
    unchanged and updates visual/on-screen text instructions only.
    """
    selected_ids = set(selection.get("scene_ids") or [])
    start = selection.get("start_time")
    end = selection.get("end_time")

    def selected(scene: dict) -> bool:
        if selected_ids and scene.get("id") in selected_ids:
            return True
        if start is not None and end is not None:
            return scene.get("end_time", 0) > start and scene.get("start_time", 0) < end
        return False

    updated = []
    before = []
    after = []
    for scene in scenes:
        next_scene = dict(scene)
        if selected(scene):
            before.append(scene)
            visual_spec = dict(next_scene.get("visual_spec") or {})
            visual_spec["prompt_edit"] = prompt
            visual_spec["consistency_constraints"] = {
                "theme": theme,
                "preserve_narration": True,
                "preserve_neighbor_flow": True,
            }
            next_scene["visual_spec"] = visual_spec
            next_scene["on_screen_text"] = _revise_text(next_scene.get("on_screen_text"), prompt)
            after.append(next_scene)
        updated.append(next_scene)
    return updated, before, after


def _revise_text(current: str | None, prompt: str) -> str:
    base = current or "Explainer scene"
    return f"{base} | Edit: {prompt[:90]}"
