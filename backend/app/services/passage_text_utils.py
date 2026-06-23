"""英語長文の抽出・検出ユーティリティ（全訳パイプライン共通）。"""

from __future__ import annotations

import re

_QUESTION_SECTION_RE = re.compile(r"^問\s*[\d０-９]", re.MULTILINE)


def question_has_english_passage(question: dict) -> bool:
    if question.get("type") != "english":
        return False
    prompt = question.get("prompt") or ""
    latin = len(re.findall(r"[a-zA-Z]", prompt))
    if latin < 40:
        return False
    cjk = len(re.findall(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]", prompt))
    return latin >= 80 or latin > cjk


def extract_english_passage_from_prompt(prompt: str) -> str:
    """問題文から英語本文ブロックを抽出する。"""
    if not prompt.strip():
        return ""

    blocks = re.split(r"\n\s*\n", prompt.strip())
    english_blocks: list[str] = []
    for block in blocks:
        stripped = block.strip()
        if not stripped:
            continue
        if _QUESTION_SECTION_RE.match(stripped):
            break
        latin = len(re.findall(r"[a-zA-Z]", stripped))
        cjk = len(re.findall(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]", stripped))
        if latin >= 20 and latin > cjk:
            english_blocks.append(stripped)
        elif english_blocks and cjk > latin:
            break

    return "\n\n".join(english_blocks).strip()


def split_source_paragraphs(passage_en: str) -> list[str]:
    blocks = [b.strip() for b in re.split(r"\n\s*\n", passage_en) if b.strip()]
    return blocks


def format_translation_with_markers(paragraphs: list[str]) -> str:
    cleaned = [p.strip() for p in paragraphs if p and p.strip()]
    if not cleaned:
        return ""
    if len(cleaned) == 1:
        return re.sub(r"^¶\s*\d+\s*\n?", "", cleaned[0]).strip()
    parts: list[str] = []
    for index, paragraph in enumerate(cleaned, start=1):
        body = re.sub(r"^¶\s*\d+\s*\n?", "", paragraph.strip())
        parts.append(f"¶{index}\n{body}")
    return "\n\n".join(parts)
