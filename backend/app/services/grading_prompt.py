from collections.abc import Callable

from app.ai.prompts.grading_english import GRADING_SYSTEM, build_grading_user_prompt
from app.ai.prompts.grading_japanese import GRADING_SYSTEM_JA, build_japanese_prompt
from app.ai.prompts.grading_no_model import GRADING_SYSTEM_NO_MODEL, build_no_model_prompt
from app.ai.prompts.grading_symbol import GRADING_SYSTEM_SYMBOL, build_symbol_prompt

PromptBuilder = Callable[..., str]

STANDARD_PROMPT_MAP: dict[str, tuple[str, PromptBuilder]] = {
    "english": (GRADING_SYSTEM, build_grading_user_prompt),
    "japanese": (GRADING_SYSTEM_JA, build_japanese_prompt),
    "symbol": (GRADING_SYSTEM_SYMBOL, build_symbol_prompt),
}


def select_grading_prompts(target: dict) -> tuple[str, PromptBuilder]:
    if target.get("gradingMode") == "no_model":
        return GRADING_SYSTEM_NO_MODEL, build_no_model_prompt

    question_type = target.get("type", "english")
    return STANDARD_PROMPT_MAP.get(question_type, STANDARD_PROMPT_MAP["english"])


def build_user_prompt(target: dict, prompt_fn: PromptBuilder) -> str:
    kwargs = {
        "question_type": target.get("type", "english"),
        "prompt": target.get("prompt", ""),
        "model_answer": target.get("modelAnswer", ""),
        "max_points": target.get("points", 10),
        "rubric": target.get("rubric"),
    }
    if prompt_fn is build_no_model_prompt:
        kwargs["part_label"] = target.get("partLabel")
    return prompt_fn(**kwargs)
