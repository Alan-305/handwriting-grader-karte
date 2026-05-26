"""教師確認済みテキストを前提にした添削プロンプト（画像なし）。"""

from app.ai.prompts.grading_common import USER_PROMPT_ALTERNATIVE_NOTE, USER_PROMPT_SCORING_NOTE


def build_text_grading_user_prompt(
    *,
    question_type: str,
    prompt: str,
    model_answer: str,
    max_points: float,
    student_answer_text: str,
    rubric: str | None,
    part_label: str | None = None,
) -> str:
    extra = f"\n追加評価基準: {rubric}" if rubric else ""
    part = f"\n小問: {part_label}" if part_label else ""
    return f"""問題タイプ: {question_type}
問題文: {prompt}
模範解答: {model_answer}
満点: {max_points}{extra}{part}

以下は、手書き答案をAIが善意に読み取り、教師が確認した「生徒の解答」の書き起こしです。
このテキストを正として採点してください（画像は参照しません）。

【生徒の解答（確認済み）】
{student_answer_text}

{USER_PROMPT_ALTERNATIVE_NOTE}{USER_PROMPT_SCORING_NOTE}"""
