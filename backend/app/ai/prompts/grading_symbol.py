from app.ai.prompts.grading_english import GRADING_SYSTEM, build_grading_user_prompt

GRADING_SYSTEM_SYMBOL = GRADING_SYSTEM.replace(
    "英語添削", "記号・選択問題の添削"
).replace(
    "別解可",
    "正答と同等の記号・選択であれば正解",
)


def build_symbol_prompt(**kwargs) -> str:
    return build_grading_user_prompt(**kwargs)
