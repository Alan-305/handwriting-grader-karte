"""第2問(A)型（東大・自由英作文）の生成プロンプト。"""

from app.ai.prompts.q5_format_guidance import format_reference_block
from app.ai.prompts.universities import _defaults
from app.ai.prompts.universities.registry import (
    build_q2a_generation_system,
    build_q2a_validator_system,
)

difficulty_label = _defaults.difficulty_label


def build_q2a_generation_user_prompt(
    *,
    topic_hint: str,
    difficulty: str,
    university_name: str = "",
    reference_context: str = "",
) -> str:
    theme = topic_hint.strip() or "お任せ"
    ref_block = format_reference_block(
        university_name=university_name,
        reference_context=reference_context.replace("第5問", "第2問(A)"),
    )
    uni_note = f"（{university_name}・第2問(A)水準）" if university_name.strip() else ""
    return (
        f"難易度: {difficulty_label(difficulty)}{uni_note}\n"
        f"テーマ・形式: {theme}{ref_block}\n"
        "上記に従い、東大第2問(A)・自由英作文の完全オリジナル予想問題と解答例・解説を JSON で作成してください。\n"
        "・設問に「60〜80語の英語で答えよ」を必ず含めること。\n"
        "・方向性の異なる解答例を2パターン（各60〜80語・wordCount に実語数）。\n"
        "・関係代名詞・分詞構文・ディスコースマーカーを用いた東大合格レベルの英文にすること。"
    )


def build_q2a_validator_user_prompt(*, problem_block: str) -> str:
    return f"""【作成された問題・解答例】
{problem_block}

東大第2問(A)自由英作文として成立しているか検証してください。
設問の60〜80語指定、解答例2つ・各語数・論理構成の解説を確認してください。"""


Q2A_VALIDATOR_SYSTEM_FALLBACK = """あなたは東京大学二次英語・第2問(A)自由英作文の検証者です。

- questionPrompt に60〜80語の英語作答指示があるか
- sampleAnswers が2件で、各 english が60〜80語程度か（wordCount と整合）
- 2つの解答例の立場・論点が明確に異なるか
- 東大合格レベルの語彙・構文か（稚拙な英語でないか）
- answerExplanations・deductionPointsJa・usefulExpressions があるか

passed は issues が空なら true。

出力 JSON のみ:
{"passed": true, "issues": [], "summary": "..."}"""
