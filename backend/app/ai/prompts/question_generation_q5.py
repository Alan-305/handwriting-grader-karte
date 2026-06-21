"""第5問型（二次入試・長文読解）の多段生成プロンプト。"""

from app.ai.prompts.q5_format_guidance import format_reference_block
from app.ai.prompts.university_prompts import (
    build_q5_passage_system,
    build_q5_questions_system,
    difficulty_label,
)

# 後方互換（import 用）
Q5_PASSAGE_SYSTEM = build_q5_passage_system("", "志望校")
Q5_QUESTIONS_SYSTEM = build_q5_questions_system("", "志望校")


def build_q5_passage_user_prompt(
    *,
    topic_hint: str,
    difficulty: str,
    university_name: str = "",
    reference_context: str = "",
) -> str:
    topic = f"\n題材の方向性: {topic_hint}" if topic_hint.strip() else ""
    uni_note = f"（{university_name}の二次入試・第5問水準）" if university_name.strip() else ""
    ref_block = format_reference_block(
        university_name=university_name,
        reference_context=reference_context,
    )
    return (
        f"難易度: {difficulty_label(difficulty)}{uni_note}{topic}{ref_block}\n"
        "上記要件で第5問の英文本文を作成してください（共通テスト第5問の型にしない）。"
    )


Q5_SOLVER_SYSTEM = """あなたは二次入試英語・第5問の解答・検証の専門家です。
試験用本文と設問を読み、正答を推論し問題の成立性を検証してください（模範解答は与えられません）。

- 4択: 本文の根拠から正解が一意（または selectCount 通り）か
- 日本語記述: 字数内で答えられ、本文に根拠があるか
- 共通テスト定型（時系列4択・Story Map・テーマ一問だけの5問）なら issues に記載
- 小問数が6〜8個か、passageAnchor の重複がないか

passed は全設問が成立し issues が空なら true。

出力 JSON のみ:
{
  "passed": true,
  "answers": [{"number": 1, "choice": "B", "answerText": "", "briefReason": "..."}],
  "issues": [],
  "summary": "日本語で総評（1〜2文）"
}"""


def build_q5_solver_user_prompt(*, passage: str, questions_block: str) -> str:
    return f"""【試験用本文（空所・下線を含む場合あり）】
{passage}

【設問】
{questions_block}

本文のみに基づいて解答し、東大型の設問として問題の品質も検証してください。"""


Q5_TEACHER_PACK_SYSTEM = """あなたは入試英語・第5問の教師用資料作成者です。
試験用本文・設問・検証済み正答に基づき、模範解答・解説・全訳を作成してください。

- modelAnswerSummary: 各問の正答（記号または日本語）を列挙し、要点を2文以内
- explanations: 各問の解説（日本語・簡潔）。和訳の英語は「」で囲む
- fullTranslationJa: 本文の日本語全訳（2段落以上の長文は各段落の先頭に ¶1、¶2… を付ける）
- vocabularyList: 重要語句5〜10個（英 — 日）

出力 JSON のみ:
{
  "modelAnswerSummary": "...",
  "explanations": [{"number": 1, "correctChoice": "B", "answerText": "", "explanationJa": "..."}],
  "fullTranslationJa": "...",
  "vocabularyList": []
}"""


def build_q5_teacher_pack_user_prompt(
    *,
    passage: str,
    questions_block: str,
    solver_answers: str,
) -> str:
    return f"""【試験用本文】
{passage}

【設問】
{questions_block}

【検証済み正答】
{solver_answers}

教師用の模範解答・解説・全訳・語彙リストを作成してください。"""


def build_q5_questions_user_prompt(
    *,
    passage: str,
    fix_issues: str = "",
    reference_context: str = "",
    university_name: str = "",
) -> str:
    fix = f"\n\n【前回の検証で指摘された点を必ず修正】\n{fix_issues}" if fix_issues.strip() else ""
    ref_block = format_reference_block(
        university_name=university_name,
        reference_context=reference_context,
    )
    return f"""【第5問・英文本文】
{passage}
{ref_block}{fix}
上記本文にのみ基づき、東大第5問形式で **小問6〜8個** を作成してください。
技能例: 空所補充・内容説明・理由説明・語法一致(a〜e)・表現の意味(a〜e)・英文一致(a〜f)・下線部・内容一致・並べ替え。
共通テスト第5問の定型5問にしない。各問の passageAnchor（本文中の当該箇所）が小問間で重複しないこと。"""
