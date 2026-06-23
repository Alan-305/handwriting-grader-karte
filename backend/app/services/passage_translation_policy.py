"""本文全訳の対象判定（問題セット内の番号ではなく、問題の種類・内容で決める）。"""

from __future__ import annotations

import re

from app.services.passage_text_utils import (
    extract_english_passage_from_prompt,
    question_has_english_passage,
)

# 参考: 大学別パイプライン上、全訳が通常不要な型
PIPELINE_NO_AI_PASSAGE_TRANSLATION = frozenset({"q1b", "q2a", "q2b", "q4b"})


def _prompt_is_wabun_eibun(prompt: str) -> bool:
    """和文英訳（日本語本文の下線部を英訳）。"""
    if not prompt.strip():
        return False
    if not re.search(r"下線部を英訳|和文.*下線|日本文.*下線|日本語文.*下線", prompt):
        return False
    latin = len(re.findall(r"[a-zA-Z]", prompt))
    cjk = len(re.findall(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]", prompt))
    return cjk >= latin


def is_ai_passage_translation_recommended(question: dict) -> bool:
    """UI で全訳欄を強調表示するか（参考用）。"""
    return is_passage_translation_target(question)


def is_passage_translation_target(question: dict) -> bool:
    """AI 全訳生成 API が受け付けるか。"""
    prompt = str(question.get("prompt") or "")
    if _prompt_is_wabun_eibun(prompt):
        return False

    if extract_english_passage_from_prompt(prompt).strip():
        return True

    if question.get("type") != "english":
        return False

    latin = len(re.findall(r"[a-zA-Z]", prompt))
    return latin >= 40


__all__ = [
    "PIPELINE_NO_AI_PASSAGE_TRANSLATION",
    "is_ai_passage_translation_recommended",
    "is_passage_translation_target",
    "question_has_english_passage",
]
