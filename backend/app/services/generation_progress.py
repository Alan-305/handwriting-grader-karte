"""問題生成パイプラインの進捗イベント（UI 向け）。"""

from __future__ import annotations

from typing import Callable, TypedDict


class GenerationProgressEvent(TypedDict, total=False):
    stage: str
    status: str
    message: str
    attempt: int
    max_attempts: int
    issues: list[str]
    provider: str


ProgressCallback = Callable[[GenerationProgressEvent], None]

STAGE_LABELS: dict[str, str] = {
    "pipeline": "準備",
    "problem": "問題文",
    "passage": "英文本文",
    "questions": "設問",
    "solver": "妥当性検証",
    "teacher_pack": "解答・解説",
    "validation": "検証",
    "save": "下書き保存",
}


def format_retry_message(
    *,
    stage: str,
    attempt: int,
    max_attempts: int,
    issues: list[str],
    stage_labels: dict[str, str] | None = None,
) -> str:
    labels = stage_labels or STAGE_LABELS
    stage_label = labels.get(stage, stage or "生成")
    headline = (
        f"{stage_label}の検証で課題を検出 — "
        f"ベテラン講師が作り直しています（{attempt}/{max_attempts}回目）"
    )
    if not issues:
        return headline
    preview = "；".join(issues[:2])
    if len(issues) > 2:
        preview += f" ほか{len(issues) - 2}件"
    return f"{headline}：{preview}"


def emit_progress(
    callback: ProgressCallback | None,
    event: GenerationProgressEvent,
) -> None:
    if callback:
        callback(event)
