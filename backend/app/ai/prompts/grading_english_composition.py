"""自由英作文向け添削プロンプト（総評・内容・文法・完成版）。"""

import re

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
- polishedAnswer: 上記アドバイスを盛り込んだ完成版の英文（英語のみ）。問題の語数指定は必ず厳守（60〜80語指定なら必ずその範囲内）
- explanation: 空文字 "" でよい
- {error_tags_instruction}
- teacherNotes: 対面指導のポイント（簡潔）

{composition_feedback_instruction}""".format(
    composition_feedback_instruction=COMPOSITION_FEEDBACK_INSTRUCTION,
    error_tags_instruction=ERROR_TAGS_INSTRUCTION,
)


def build_word_count_requirement(*, prompt: str, target_words: int | None) -> str:
    """問題文・形式設定から polishedAnswer 用の語数制限文を組み立てる。"""
    range_match = re.search(
        r"(\d+)\s*[〜~\-－]\s*(\d+)\s*(?:語|words?\b)",
        prompt,
        re.IGNORECASE,
    )
    if range_match:
        lo, hi = int(range_match.group(1)), int(range_match.group(2))
        if lo > hi:
            lo, hi = hi, lo
        return (
            f"\n【語数制限（必須・厳守）】{lo}〜{hi}語。"
            f"polishedAnswer は必ず {lo}語以上 {hi}語以下に収めること。"
            f"範囲を大きく超える英文（例: {hi + 20}語）は生徒の参考にならないため絶対に避ける。"
        )

    single_match = re.search(
        r"(?:約|about\s*)?(\d+)\s*(?:語|words?\b)",
        prompt,
        re.IGNORECASE,
    )
    if single_match:
        target = int(single_match.group(1))
        tolerance = max(3, round(target * 0.1))
        lo, hi = target - tolerance, target + tolerance
        return (
            f"\n【語数制限（必須・厳守）】約{target}語（許容: {lo}〜{hi}語）。"
            f"polishedAnswer はこの範囲内に収めること。"
        )

    if target_words:
        tolerance = max(5, round(target_words * 0.1))
        lo, hi = target_words - tolerance, target_words + tolerance
        return (
            f"\n【語数制限（必須・厳守）】目標約{target_words}語（許容: {lo}〜{hi}語）。"
            f"polishedAnswer は問題の条件に合わせ、この範囲内に収めること。"
        )

    return (
        "\n【語数制限（必須）】問題文に語数指定がある場合、polishedAnswer はその指定を必ず守ること。"
        "指定を無視して長文を書いてはならない。"
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
    word_requirement = build_word_count_requirement(prompt=prompt, target_words=target_words)
    return f"""問題タイプ: 自由英作文
問題文: {prompt}
模範解答（参考）: {model_answer}
満点: {max_points}{word_requirement}{extra}
{student_address_block(student_name)}

【解答（教師確認済み）】
{student_answer_text}

feedback は総評のみ（2〜3文）。
contentEvaluation は「内容について」として良い点・改善点を改行付き箇条書き。
grammarEvaluation は「文法・語法・表現について」として「誤り→正しい表現」＋理由を改行付き箇条書き。
polishedAnswer はアドバイスを盛り込んだ完成版英文。語数指定は必ず厳守し、範囲外の長文にしないこと。
{USER_PROMPT_ALTERNATIVE_NOTE}{USER_PROMPT_SCORING_NOTE}"""
