from collections.abc import Callable

from app.ai.prompts.grading_english import GRADING_SYSTEM, build_grading_user_prompt
from app.ai.prompts.grading_english_composition import (
    COMPOSITION_SYSTEM,
    build_composition_text_prompt,
)
from app.services.grading_modes import is_english_composition
from app.ai.prompts.grading_japanese import GRADING_SYSTEM_JA, build_japanese_prompt
from app.ai.prompts.grading_no_model import GRADING_SYSTEM_NO_MODEL, build_no_model_prompt
from app.ai.prompts.grading_symbol import GRADING_SYSTEM_SYMBOL, build_symbol_prompt
from app.ai.prompts.grading_text import build_text_grading_user_prompt

PromptBuilder = Callable[..., str]

STANDARD_PROMPT_MAP: dict[str, tuple[str, PromptBuilder]] = {
    "english": (GRADING_SYSTEM, build_grading_user_prompt),
    "japanese": (GRADING_SYSTEM_JA, build_japanese_prompt),
    "symbol": (GRADING_SYSTEM_SYMBOL, build_symbol_prompt),
}


def select_grading_prompts(target: dict) -> tuple[str, PromptBuilder]:
    if target.get("gradingMode") == "no_model":
        return GRADING_SYSTEM_NO_MODEL, build_no_model_prompt

    if is_english_composition(target):
        return COMPOSITION_SYSTEM, build_grading_user_prompt  # image path unused

    question_type = target.get("type", "english")
    return STANDARD_PROMPT_MAP.get(question_type, STANDARD_PROMPT_MAP["english"])


def build_user_prompt(
    target: dict,
    prompt_fn: PromptBuilder,
    *,
    student_name: str | None = None,
) -> str:
    kwargs = {
        "question_type": target.get("type", "english"),
        "prompt": target.get("prompt", ""),
        "model_answer": target.get("modelAnswer", ""),
        "max_points": target.get("points", 10),
        "rubric": target.get("rubric"),
        "student_name": student_name,
    }
    if prompt_fn is build_no_model_prompt:
        kwargs["part_label"] = target.get("partLabel")
    return prompt_fn(**kwargs)


def build_text_user_prompt(
    target: dict,
    student_answer_text: str,
    *,
    student_name: str | None = None,
) -> str:
    if is_english_composition(target):
        opts = target.get("formatOptions") or {}
        return build_composition_text_prompt(
            prompt=target.get("prompt", ""),
            model_answer=target.get("modelAnswer", ""),
            max_points=float(target.get("points", 10)),
            student_answer_text=student_answer_text,
            rubric=target.get("rubric"),
            target_words=opts.get("targetWords"),
            student_name=student_name,
        )
    return build_text_grading_user_prompt(
        question_type=target.get("type", "english"),
        prompt=target.get("prompt", ""),
        model_answer=target.get("modelAnswer", ""),
        max_points=float(target.get("points", 10)),
        student_answer_text=student_answer_text,
        rubric=target.get("rubric"),
        part_label=target.get("partLabel"),
        student_name=student_name,
    )


def grading_response_schema(target: dict):
    from app.ai.schemas.grading import EnglishCompositionGradeResult, GradeResult

    if is_english_composition(target):
        return EnglishCompositionGradeResult
    return GradeResult
