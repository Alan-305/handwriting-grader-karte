"""長文総合読解（小問単位）の添削プロンプト。"""

from app.ai.prompts.grading_common import (
    COMPREHENSIVE_READING_INSTRUCTION,
    USER_PROMPT_ALTERNATIVE_NOTE,
    USER_PROMPT_SCORING_NOTE,
    student_address_block,
)
from app.services.error_tags import ERROR_TAGS_INSTRUCTION

GRADING_SYSTEM_COMPREHENSIVE = """あなたは高校生向け入試英語・長文総合読解の添削専門家です。
長文と設問文を踏まえ、教師確認済みの当該小問の解答を採点してください。

評価基準:
- 優: 模範解答と完全一致でなくても、文法的に正しく意味が通じれば合格（別解可）
- 日本語記述: 追加評価基準（rubric）の**必須採点ポイント**を押さえ、解答全体が正解の**方向性**で書かれていれば「優」。表現の個人差は許容
- 良: スペリングミスや軽微なケアレスミス、やや内容不足だが通じる。日本語記述で必須ポイント1つ欠ける程度
- 不可: 時制・文構造の重大誤り、課題から大きく外れた内容（別解でも意味・文法が正しければ不可にしない）。日本語記述で必須ポイントの過半欠如・本文矛盾

別解の扱い:
- 模範解答と異なっていても、文法的に正しく意味が通じる別解を「不可」にしてはならない
- 模範解答との不一致だけを理由に不可としない

採点方法（減点方式）:
- maxPoints から減点して score を決め、grade と整合させる

禁止事項:
- 「不合格」という言葉は絶対に使わない
- ネガティブで打ちのめす表現は避ける

出力は必ず JSON のみ。フィールド:
grade, score, maxPoints, studentAnswerText, feedback, explanation, errorTags, teacherNotes

{comprehensive_reading_instruction}
{error_tags_instruction}
teacherNotes は対面指導で突くべきポイント（簡潔に）。""".format(
    comprehensive_reading_instruction=COMPREHENSIVE_READING_INSTRUCTION,
    error_tags_instruction=ERROR_TAGS_INSTRUCTION,
)


def _build_comprehensive_user_prompt(
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
    return f"""問題タイプ: 長文総合読解（小問）
問題文（長文・設問を含む）: {prompt}
模範解答（当該小問）: {model_answer}
満点: {max_points}{extra}{part}
{student_address_block(student_name)}
{answer_block}
feedback は当該小問の総評（2〜3文・コンパクト）のみ。
explanation は箇条書きの解説（1項目1行・改行区切り）。選択肢問題なら正答・誤選肢の理由も含める。模範解答全文は explanation に書かない。
{USER_PROMPT_ALTERNATIVE_NOTE}{USER_PROMPT_SCORING_NOTE}"""


def build_comprehensive_prompt(**kwargs) -> str:
    return _build_comprehensive_user_prompt(**kwargs)


def build_comprehensive_text_prompt(**kwargs) -> str:
    return _build_comprehensive_user_prompt(**kwargs)
