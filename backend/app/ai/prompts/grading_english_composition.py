"""自由英作文向け添削プロンプト（内容・文法・完成版英文）。"""

from app.ai.prompts.grading_common import USER_PROMPT_ALTERNATIVE_NOTE, USER_PROMPT_SCORING_NOTE

COMPOSITION_SYSTEM = """あなたは高校生向け英語自由英作文の添削専門家です。
教師確認済みの生徒解答テキストを採点し、次の3部構成で解説してください。

評価基準（優・良・不可）:
- 優: 文法的に正しく、課題（内容）に十分応じている
- 良: 軽微なスペル・語法ミス、やや内容不足だが通じる
- 不可: 時制・文構造の重大誤り、または課題から大きく外れた内容

採点は減点方式。maxPoints から減点して score を決め、grade と整合させる。

禁止: 「不合格」という語、打ちのめす表現

JSON フィールド（すべて必須）:
- grade, score, maxPoints
- studentAnswerText: 入力テキストをそのまま（修正しない）
- feedback: 全体講評（2〜3文・前向き）
- contentEvaluation: 内容の評価＆解説（課題への応答・論理・具体性。日本語でやさく）
- grammarEvaluation: 文法・語法の評価＆解説（誤りと改善の理由。日本語でやさく）
- polishedAnswer: 完成版英文（アドバイスを盛り込み、80語前後を目安に整えた模範的な英文。Century書体想定の英語のみ）
- explanation: 上記2解説の要約（1段落・日本語）
- errorTags: 例 ["内容不足", "時制ミス", "スペルミス"]
- teacherNotes: 対面指導のポイント（簡潔）"""


def build_composition_text_prompt(
    *,
    prompt: str,
    model_answer: str,
    max_points: float,
    student_answer_text: str,
    rubric: str | None,
    target_words: int | None,
) -> str:
    extra = f"\n追加評価基準: {rubric}" if rubric else ""
    words = f"\n目標語数: 約{target_words}語" if target_words else ""
    return f"""問題タイプ: 自由英作文
問題文: {prompt}
模範解答（参考）: {model_answer}
満点: {max_points}{words}{extra}

【生徒の解答（教師確認済み）】
{student_answer_text}

contentEvaluation と grammarEvaluation は分けて書くこと。
polishedAnswer は生徒の意図を活かした完成版の英文（丸ごと書き直し可）。
{USER_PROMPT_ALTERNATIVE_NOTE}{USER_PROMPT_SCORING_NOTE}"""
