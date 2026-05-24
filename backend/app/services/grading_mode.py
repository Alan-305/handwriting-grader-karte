def _effective_model_answer(question: dict, part: dict | None) -> str:
    if part:
        raw = part.get("modelAnswer")
        if raw is not None:
            return str(raw).strip()
    return str(question.get("modelAnswer") or "").strip()


def resolve_grading_mode(question: dict, part: dict | None = None) -> str:
    """standard | no_model — 模範解答が空のとき no_model 用プロンプトへルーティング。"""
    if part and part.get("gradingMode") in ("no_model", "standard"):
        return part["gradingMode"]
    if question.get("gradingMode") in ("no_model", "standard"):
        return question["gradingMode"]

    if not _effective_model_answer(question, part):
        return "no_model"

    return "standard"
