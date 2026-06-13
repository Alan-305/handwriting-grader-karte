"""解答欄（小問含む）の crop・添削単位を展開する。"""

from app.services.grading_mode import resolve_grading_mode


def _points_for_part(q: dict, part: dict | None, part_count: int) -> float:
    if part is not None and part.get("points") is not None:
        return float(part["points"])
    total = float(q.get("points", 10))
    if part_count > 1:
        return total / part_count
    return total


def iter_crop_targets(questions: list[dict]) -> list[dict]:
    targets = []
    for q in questions:
        parts = q.get("answerParts") or []
        if parts:
            for i, part in enumerate(parts):
                targets.append(
                    _build_target(
                        q,
                        part,
                        i,
                        part.get("label", f"({i + 1})"),
                        part_count=len(parts),
                    )
                )
        else:
            targets.append(_build_target(q, None, 0, None, part_count=1))
    return targets


def _build_target(
    q: dict,
    part: dict | None,
    part_index: int,
    part_label: str | None,
    *,
    part_count: int,
) -> dict:
    answer_format = (part or {}).get("answerFormat") or q.get("answerFormat")
    part_model = ((part or {}).get("modelAnswer") or "").strip() if part else ""
    question_model = (q.get("modelAnswer") or "").strip()
    return {
        "questionId": q["id"],
        "order": q["order"],
        "partIndex": part_index,
        "partLabel": part_label,
        "type": q.get("type", "english"),
        "answerFormat": answer_format,
        "questionAnswerFormat": q.get("answerFormat"),
        "partCount": part_count,
        "generationPipeline": q.get("generationPipeline"),
        "formatOptions": (part or {}).get("formatOptions") or q.get("formatOptions"),
        "gradingMode": resolve_grading_mode(q, part),
        "prompt": q.get("prompt", ""),
        "modelAnswer": part_model or question_model,
        "points": _points_for_part(q, part, part_count),
        "rubric": q.get("rubric"),
        "cropRegion": (part or q)["cropRegion"],
    }


def crop_filename(order: int, part_index: int, has_parts: bool) -> str:
    if has_parts:
        return f"q{order}_p{part_index + 1}.jpg"
    return f"q{order}.jpg"
