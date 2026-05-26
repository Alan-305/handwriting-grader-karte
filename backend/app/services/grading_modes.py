"""設問ごとの添削モード判定。"""


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
