"""第5問生成パイプラインの進捗イベント（UI 向け）。"""

from __future__ import annotations

from typing import Callable, TypedDict


class Q5ProgressEvent(TypedDict, total=False):
    stage: str
    status: str
    message: str
    attempt: int
    max_attempts: int
    issues: list[str]


ProgressCallback = Callable[[Q5ProgressEvent], None]


def format_retry_message(
    *,
    stage: str,
    attempt: int,
    max_attempts: int,
    issues: list[str],
) -> str:
    stage_label = {
        "passage": "英文本文",
        "questions": "設問",
        "solver": "解答妥当性",
        "teacher_pack": "解答・解説",
    }.get(stage, "生成")
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
