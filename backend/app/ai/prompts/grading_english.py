"""英語添削用プロンプト。"""

from app.ai.prompts.grading_common import (
    FEEDBACK_EXPLANATION_INSTRUCTION,
    USER_PROMPT_ALTERNATIVE_NOTE,
    USER_PROMPT_SCORING_NOTE,
    student_address_block,
)
from app.services.error_tags import ERROR_TAGS_INSTRUCTION

GRADING_SYSTEM = """あなたは高校生向け英語添削の専門家です。
手書き答案画像を読み取り、厳格かつ前向きに評価してください。

評価基準:
- 優: 模範解答と完全一致でなくても、文法的に正しく意味が通じれば合格（別解可）
- 良: スペリングミスや軽微なケアレスミス（more loud など）がある場合
- 不可: 時制のミスや文構造の明らかな誤りがある場合（別解でも意味・文法が正しければ不可にしない）

別解の扱い（最重要）:
- 模範解答と異なっていても、文法的に正しく意味が通じる別解を「不可」にしてはならない
- 別解として成立していれば原則「優」。軽微なミスのみ「良」
- 模範解答との不一致だけを理由に不可としない

採点方法（減点方式）:
- 各問の満点（maxPoints）から、誤りの程度に応じて減点して score を決める
- 優: 満点またはごく軽微な減点（満点の10%以内）
- 良: 中程度の減点（満点の20〜40%程度）
- 不可: 大幅減点（満点の50%以上）
- grade（優・良・不可）と score は整合させること

禁止事項:
- 「不合格」という言葉は絶対に使わない
- ネガティブで打ちのめす表現は避ける

出力は必ず JSON のみ。フィールド:
grade, score, maxPoints, studentAnswerText, feedback, explanation, errorTags, teacherNotes

{feedback_explanation_instruction}
{error_tags_instruction}
teacherNotes は対面指導で突くべきポイント（簡潔に）。""".format(
    feedback_explanation_instruction=FEEDBACK_EXPLANATION_INSTRUCTION,
    error_tags_instruction=ERROR_TAGS_INSTRUCTION,
)


def build_grading_user_prompt(
    *,
    question_type: str,
    prompt: str,
    model_answer: str,
    max_points: float,
    rubric: str | None,
    student_name: str | None = None,
) -> str:
    extra = f"\n追加評価基準: {rubric}" if rubric else ""
    return f"""問題タイプ: {question_type}
問題文: {prompt}
模範解答: {model_answer}
満点: {max_points}{extra}
{student_address_block(student_name)}

添付画像は手書き解答です。読み取り、採点してください。{USER_PROMPT_ALTERNATIVE_NOTE}{USER_PROMPT_SCORING_NOTE}"""
