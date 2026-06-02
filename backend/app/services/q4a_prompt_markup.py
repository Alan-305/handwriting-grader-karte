"""第4問(A)・誤り指摘：英文中の下線部を *...* 記法で統一する。"""

from __future__ import annotations

import re

from app.ai.schemas.q4a_generation import Q4AItem, Q4AProblemResult

_EMPHASIS = re.compile(r"\*[^*\n]+\*")


def _phrase_is_marked(block: str, phrase: str) -> bool:
    if not phrase:
        return False
    if f"*{phrase}*" in block:
        return True
    return bool(re.search(rf"\*[^*\n]*{re.escape(phrase)}[^*\n]*\*", block))


def ensure_q4a_english_block_markup(item: Q4AItem) -> str:
    """parts の各語句を englishBlock 内で *語句* にする（アプリの下線表示用）。"""
    block = (item.english_block or "").strip()
    if not block or not item.parts:
        return block

    for part in sorted(item.parts, key=lambda p: p.label):
        phrase = part.text.strip()
        if not phrase or _phrase_is_marked(block, phrase):
            continue
        legacy = f"*{phrase}({part.label})*"
        if legacy in block:
            block = block.replace(legacy, f"*{phrase}*", 1)
            continue
        if phrase in block:
            block = block.replace(phrase, f"*{phrase}*", 1)
    return block


def normalize_q4a_problem_markup(problem: Q4AProblemResult) -> Q4AProblemResult:
    for item in problem.items:
        item.english_block = ensure_q4a_english_block_markup(item)
    return problem


def q4a_markup_issues(problem: Q4AProblemResult) -> list[str]:
    issues: list[str] = []
    for item in problem.items:
        block = ensure_q4a_english_block_markup(item)
        for part in item.parts:
            phrase = part.text.strip()
            if not phrase:
                issues.append(f"問{item.number}: 下線部 ({part.label}) の text が空")
            elif not _phrase_is_marked(block, phrase):
                issues.append(
                    f"問{item.number}: ({part.label})「{phrase[:40]}…」が "
                    "englishBlock 内で *...* になっていない"
                )
        if block and not _EMPHASIS.search(block):
            issues.append(f"問{item.number}: englishBlock に *...* 下線記法がない")
    return issues
