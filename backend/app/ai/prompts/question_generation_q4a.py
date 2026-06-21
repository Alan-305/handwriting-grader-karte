"""第4問(A)型（東大・誤り指摘）の多段生成プロンプト。"""

from app.ai.prompts.q5_format_guidance import format_reference_block
from app.ai.prompts.universities import _defaults
from app.ai.prompts.universities.registry import (
    build_q4a_problem_system,
    build_q4a_teacher_pack_system,
    build_q4a_validator_system,
)

difficulty_label = _defaults.difficulty_label


def build_q4a_problem_user_prompt(
    *,
    topic_hint: str,
    difficulty: str,
    university_name: str = "",
    reference_context: str = "",
    source_passage: str = "",
) -> str:
    topic = f"\n【テーマ・作詞指示】\n{topic_hint}" if topic_hint.strip() else ""
    source = (
        f"\n【素材となる英文（この英文を使用すること）】\n{source_passage.strip()}\n"
        if source_passage.strip()
        else ""
    )
    ref_block = format_reference_block(
        university_name=university_name,
        reference_context=reference_context.replace("第5問", "第4問(A)"),
    )
    uni_note = f"（{university_name}・第4問(A)水準）" if university_name.strip() else ""
    return (
        f"難易度: {difficulty_label(difficulty)}{uni_note}{topic}{source}{ref_block}\n"
        "上記に従い、東大第4問(A)・誤り指摘問題を作成してください。"
        "5つの独立パラグラフ（(1)〜(5)）各に下線部5箇所を (a) *5〜10語の英文* 形式で設けてください。"
    )


def build_q4a_validator_user_prompt(*, problem_block: str) -> str:
    return f"""【作成された問題（各問の errorLabel を含む）】
{problem_block}

東大レベルの誤り指摘として成立しているか検証してください。"""


def build_q4a_teacher_pack_user_prompt(*, problem_block: str, validator_summary: str) -> str:
    return f"""【問題】
{problem_block}

【検証メモ】
{validator_summary}

教師用の解答・解説を作成してください（生徒向け問題文には誤りの明示を含めない）。"""


Q4A_VALIDATOR_SYSTEM_FALLBACK = """あなたは東京大学二次英語・第4問(A)誤り指摘の検証者です。
各設問に (a)〜(e) があり、errorLabel で示された1箇所だけが不適切か検証してください。

- 各問で誤りがちょうど1つか
- 残り4つが完全に正しい英語か
- 誤りが単なるスペルミス・初級文法ではなく、東大レベル（主語動詞の遠距離一致、冠詞、態、分詞・関係詞、文脈矛盾など）か

passed は issues が空なら true。

出力 JSON のみ:
{"passed": true, "issues": [], "summary": "..."}"""


Q4A_TEACHER_PACK_SYSTEM_FALLBACK = """あなたは東京大学二次英語・第4問(A)の教師用解答・解説作成者です。

- modelAnswerSummary: 各問の正答記号を「(1) c, (2) a, …」形式で列挙し、要点を1文
- explanations: 各問について、なぜ errorLabel が誤りか（文法・語法・構文・文脈）を日本語で簡潔に。修正例の英文 correctionEn を示す

出力 JSON のみ:
{
  "modelAnswerSummary": "...",
  "explanations": [
    {"number": 1, "errorLabel": "c", "errorCategory": "syntax", "explanationJa": "...", "correctionEn": "..."}
  ]
}"""
