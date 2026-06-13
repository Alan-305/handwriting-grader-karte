"""設問ごとの添削モード判定。"""

_SYMBOL_ANSWER_FORMATS = frozenset({"short", "symbol"})


def is_symbol_short_answer(target: dict) -> bool:
    if target.get("type") == "symbol":
        return True
    fmt = target.get("answerFormat") or ""
    return fmt in _SYMBOL_ANSWER_FORMATS


def is_comprehensive_reading_part(target: dict) -> bool:
    """長文総合読解の小問（複数 answerParts または composite 大問）。"""
    if is_english_composition(target):
        return False
    part_count = int(target.get("partCount") or 1)
    if part_count > 1:
        return True
    q_fmt = target.get("questionAnswerFormat") or ""
    return q_fmt == "composite"


def is_english_composition(target: dict) -> bool:
    fmt = target.get("answerFormat") or ""
    if fmt == "english_composition":
        return True
    prompt = (target.get("prompt") or "").lower()
    if "英作文" in prompt or "自由英作文" in prompt:
        return True
    if "語" in prompt and ("write" in prompt or "english" in prompt or "英語" in prompt):
        opts = target.get("formatOptions") or {}
        if opts.get("targetWords") or opts.get("compositionLines"):
            return True
    return False
