"""本文全訳の対象外ルール（第2問A/B・第3問は除く）。"""

from __future__ import annotations

import re

EXCLUDED_PIPELINES = frozenset({"q2a", "q2b"})
EXCLUDED_MAJOR_ORDERS = frozenset({3})


def _normalize_part_label(part_label: str | None) -> str:
    if not part_label:
        return ""
    match = re.search(r"[A-Za-zＡ-Ｚａ-ｚ]", str(part_label))
    return match.group(0).upper() if match else ""


def question_has_english_passage(question: dict) -> bool:
    if question.get("type") != "english":
        return False
    prompt = question.get("prompt") or ""
    latin = len(re.findall(r"[a-zA-Z]", prompt))
    if latin < 40:
        return False
    cjk = len(re.findall(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]", prompt))
    return latin >= 80 or latin > cjk


def is_excluded_from_passage_translation(question: dict) -> bool:
    """第2問(A)(B)・第3問は本文全訳の自動生成対象外。"""
    pipeline = str(question.get("generationPipeline") or "").lower()
    if pipeline in EXCLUDED_PIPELINES:
        return True

    order = int(question.get("order") or question.get("majorOrder") or 0)
    if order in EXCLUDED_MAJOR_ORDERS:
        return True

    if order == 2:
        part = _normalize_part_label(question.get("partLabel"))
        if part in {"A", "B"}:
            return True

    return False


def is_passage_translation_target(question: dict) -> bool:
    if is_excluded_from_passage_translation(question):
        return False
    return question_has_english_passage(question)
