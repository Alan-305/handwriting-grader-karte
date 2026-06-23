"""本文全訳の対象判定（問題セット内の番号ではなく、問題の種類・内容で決める）。"""

from __future__ import annotations

import re

# 大学別生成パイプライン上の「本文全訳が通常不要」な型
# （和文英訳・下線部和訳・空所補充/並べ替え・自由英作文）
PIPELINE_NO_AI_PASSAGE_TRANSLATION = frozenset({"q1b", "q2a", "q2b", "q4b"})


def question_has_english_passage(question: dict) -> bool:
    if question.get("type") != "english":
        return False
    prompt = question.get("prompt") or ""
    latin = len(re.findall(r"[a-zA-Z]", prompt))
    if latin < 40:
        return False
    cjk = len(re.findall(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]", prompt))
    return latin >= 80 or latin > cjk


def _prompt_is_wabun_eibun(prompt: str) -> bool:
    """和文英訳（日本語本文の下線部を英訳）。"""
    if not prompt.strip():
        return False
    if not re.search(r"下線部を英訳|和文.*下線|日本文.*下線|日本語文.*下線", prompt):
        return False
    latin = len(re.findall(r"[a-zA-Z]", prompt))
    cjk = len(re.findall(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]", prompt))
    return cjk >= latin


def _prompt_is_english_underline_to_ja(prompt: str) -> bool:
    """英語の下線部を日本語に訳す型（東大第4問B 等）。"""
    return bool(
        re.search(r"下線部.{0,24}日本語|日本語に訳|和訳せよ", prompt)
        and "誤り" not in prompt
        and "不適切" not in prompt
    )


def _prompt_is_composition(prompt: str, answer_format: str | None) -> bool:
    if answer_format == "english_composition":
        return True
    if re.search(r"英作文|自由英作", prompt):
        return True
    if re.search(r"\d+\s*語", prompt) and re.search(r"書きなさい|書け", prompt):
        return True
    lowered = prompt.lower()
    return "words" in lowered and ("write" in lowered or "compose" in lowered)


def is_ai_passage_translation_recommended(question: dict) -> bool:
    """
    AI による本文全訳の生成を推奨するか。
    問題セット内の第何問か・大学別の大問番号は見ない。
    """
    pipeline = str(question.get("generationPipeline") or "").lower()
    if pipeline in PIPELINE_NO_AI_PASSAGE_TRANSLATION:
        return False

    prompt = str(question.get("prompt") or "")
    answer_format = str(question.get("answerFormat") or "")

    if _prompt_is_composition(prompt, answer_format or None):
        return False
    if _prompt_is_wabun_eibun(prompt):
        return False
    if pipeline == "q4b" or _prompt_is_english_underline_to_ja(prompt):
        return False

    return question_has_english_passage(question)


def is_passage_translation_target(question: dict) -> bool:
    return is_ai_passage_translation_recommended(question)
