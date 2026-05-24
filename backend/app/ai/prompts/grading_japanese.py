from app.ai.prompts.grading_english import GRADING_SYSTEM, build_grading_user_prompt

GRADING_SYSTEM_JA = GRADING_SYSTEM.replace(
    "英語添削", "日本語記述添削"
).replace(
    "別解可",
    "要点が押さえられていれば表現の違いは許容",
)


def build_japanese_prompt(**kwargs) -> str:
    return build_grading_user_prompt(**kwargs)
