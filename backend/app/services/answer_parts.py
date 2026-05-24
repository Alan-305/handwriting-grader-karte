"""解答欄（小問含む）の crop・添削単位を展開する。"""

from app.services.grading_mode import resolve_grading_mode


def iter_crop_targets(questions: list[dict]) -> list[dict]:
    targets = []
    for q in questions:
        parts = q.get("answerParts") or []
        if parts:
            for i, part in enumerate(parts):
                targets.append(
                    _build_target(q, part, i, part.get("label", f"({i + 1})"))
                )
        else:
            targets.append(_build_target(q, None, 0, None))
    return targets


def _build_target(q: dict, part: dict | None, part_index: int, part_label: str | None) -> dict:
    answer_format = (part or {}).get("answerFormat") or q.get("answerFormat")
    return {
        "questionId": q["id"],
        "order": q["order"],
        "partIndex": part_index,
        "partLabel": part_label,
        "type": q.get("type", "english"),
        "answerFormat": answer_format,
        "gradingMode": resolve_grading_mode(q, part),
        "prompt": q.get("prompt", ""),
        "modelAnswer": (part or {}).get("modelAnswer") or q.get("modelAnswer", ""),
        "points": (part or {}).get("points") or q.get("points", 10),
        "rubric": q.get("rubric"),
        "cropRegion": (part or q)["cropRegion"],
    }


def crop_filename(order: int, part_index: int, has_parts: bool) -> str:
    if has_parts:
        return f"q{order}_p{part_index + 1}.jpg"
    return f"q{order}.jpg"
