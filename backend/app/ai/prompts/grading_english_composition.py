"""自由英作文向け添削プロンプト（総評・内容・文法・完成版）。"""

from app.ai.prompts.grading_common import (
    COMPOSITION_FEEDBACK_INSTRUCTION,
    USER_PROMPT_ALTERNATIVE_NOTE,
    USER_PROMPT_SCORING_NOTE,
    student_address_block,
)
from app.services.error_tags import ERROR_TAGS_INSTRUCTION

COMPOSITION_SYSTEM = """あなたは高校生向け英語自由英作文の添削専門家です。
教師確認済みの解答テキストを採点してください。

評価基準（優・良・不可）:
- 優: 文法的に正しく、課題（内容）に十分応じている
- 良: 軽微なスペル・語法ミス、やや内容不足だが通じる
- 不可: 時制・文構造の重大誤り、または課題から大きく外れた内容

採点は減点方式。maxPoints から減点して score を決め、grade と整合させる。

禁止: 「不合格」という語、打ちのめす表現

JSON フィールド（すべて必須）:
- grade, score, maxPoints
- studentAnswerText: 入力テキストをそのまま（修正しない）
- feedback: 総評（2〜3文・前向き）。全体の出来をコンパクトに。内容・文法の個別解説は書かない
- contentEvaluation: 内容について。論の展開・具体例の整合性・説得力の観点で良い点と改善点を箇条書き（1項目1行・改行区切り）
- grammarEvaluation: 文法・語法・表現について。誤りがある場合は「誤り→正しい表現」形式＋修正理由を箇条書き（1項目1行・改行区切り。該当なしなら「特になし」1行）
- polishedAnswer: 上記アドバイスを盛り込んだ完成版の英文（英語のみ）
- explanation: 空文字 "" でよい
- {error_tags_instruction}
- teacherNotes: 対面指導のポイント（簡潔）

{composition_feedback_instruction}""".format(
    composition_feedback_instruction=COMPOSITION_FEEDBACK_INSTRUCTION,
    error_tags_instruction=ERROR_TAGS_INSTRUCTION,
)


def build_composition_text_prompt(
    *,
    prompt: str,
    model_answer: str,
    max_points: float,
    student_answer_text: str,
    rubric: str | None,
    target_words: int | None,
    student_name: str | None = None,
) -> str:
    extra = f"\n追加評価基準: {rubric}" if rubric else ""
    words = f"\n目標語数: 約{target_words}語" if target_words else ""
    return f"""問題タイプ: 自由英作文
問題文: {prompt}
模範解答（参考）: {model_answer}
満点: {max_points}{words}{extra}
{student_address_block(student_name)}

【解答（教師確認済み）】
{student_answer_text}

feedback は総評のみ（2〜3文）。
contentEvaluation は「内容について」として良い点・改善点を改行付き箇条書き。
grammarEvaluation は「文法・語法・表現について」として「誤り→正しい表現」＋理由を改行付き箇条書き。
polishedAnswer はアドバイスを盛り込んだ完成版英文。
{USER_PROMPT_ALTERNATIVE_NOTE}{USER_PROMPT_SCORING_NOTE}"""
