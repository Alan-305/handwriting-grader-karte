"""記号・選択・正誤問題の添削プロンプト。"""

from app.ai.prompts.grading_common import (
    SYMBOL_FEEDBACK_EXPLANATION_INSTRUCTION,
    USER_PROMPT_SCORING_NOTE,
    student_address_block,
)
from app.services.error_tags import ERROR_TAGS_INSTRUCTION

GRADING_SYSTEM_SYMBOL = """あなたは高校生向け入試英語の記号・選択・正誤問題の添削専門家です。
手書き答案（記号・選択記号・○×など）を読み取り、模範解答と照合して採点してください。

採点の考え方:
- 記号・選択・正誤の一致を最優先する
- 1問1答は正答なら満点、誤答なら原則0点（部分点は問題文・模範解答に明記がある場合のみ）

評価基準:
- 優: 正答
- 不可: 誤答（記号の取り違え、空欄ミス、選択ミスなど）
- 良: 正誤がはっきりしている問題では使わない（優か不可のみ）

採点方法:
- score は正答なら maxPoints、誤答なら 0（部分点の指示がある場合のみ例外）
- grade（優・良・不可）と score は整合させること

禁止事項:
- 「不合格」という言葉は絶対に使わない
- ネガティブで打ちのめす表現は避ける

出力は必ず JSON のみ。フィールド:
grade, score, maxPoints, studentAnswerText, feedback, explanation, errorTags, teacherNotes

{symbol_feedback_explanation_instruction}
{error_tags_instruction}
teacherNotes は対面指導で突くべきポイント（簡潔に）。""".format(
    symbol_feedback_explanation_instruction=SYMBOL_FEEDBACK_EXPLANATION_INSTRUCTION,
    error_tags_instruction=ERROR_TAGS_INSTRUCTION,
)


def _build_symbol_user_prompt(
    *,
    prompt: str,
    model_answer: str,
    max_points: float,
    rubric: str | None,
    part_label: str | None = None,
    student_name: str | None = None,
    student_answer_text: str | None = None,
) -> str:
    extra = f"\n追加評価基準: {rubric}" if rubric else ""
    part = f"\n採点対象の小問: {part_label}" if part_label else ""
    answer_block = ""
    if student_answer_text is not None:
        answer_block = f"""
以下は、手書き答案をAIが読み取り、教師が確認した解答の書き起こしです。
このテキストを正として採点してください（画像は参照しません）。

【解答（教師確認済み）】
{student_answer_text}
"""
    return f"""問題タイプ: symbol（記号・選択・正誤）
問題文: {prompt}
模範解答: {model_answer}
満点: {max_points}{extra}{part}
{student_address_block(student_name)}
{answer_block}
記号・選択の正誤を照合して採点してください。
explanation は小問ごとに改行し、「(1) 正解：…」「(2) 不正解：…」形式で書くこと。模範解答の内容は explanation に含め、別欄に頼らないこと。
各行の先頭で正誤を明示しているため、「したがって正解。」「よって不正解。」などの締めは書かないこと。{USER_PROMPT_SCORING_NOTE}"""


def build_symbol_prompt(**kwargs) -> str:
    return _build_symbol_user_prompt(**kwargs)


def build_symbol_text_prompt(**kwargs) -> str:
    return _build_symbol_user_prompt(**kwargs)
