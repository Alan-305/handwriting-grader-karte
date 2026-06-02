"""第4問(B)型（東大・下線部和訳）の生成プロンプト。"""

from app.ai.prompts.q5_format_guidance import format_reference_block
from app.ai.prompts.universities import _defaults
from app.ai.prompts.universities.registry import (
    build_q4b_generation_system,
    build_q4b_validator_system,
)

difficulty_label = _defaults.difficulty_label


def build_q4b_generation_user_prompt(
    *,
    topic_hint: str,
    difficulty: str,
    university_name: str = "",
    reference_context: str = "",
) -> str:
    theme = topic_hint.strip() or "お任せ"
    ref_block = format_reference_block(
        university_name=university_name,
        reference_context=reference_context.replace("第5問", "第4問(B)"),
    )
    uni_note = f"（{university_name}・第4問(B)水準）" if university_name.strip() else ""
    return (
        f"難易度: {difficulty_label(difficulty)}{uni_note}\n"
        f"テーマ: {theme}{ref_block}\n"
        "上記に従い、東大第4問(B)・下線部和訳の完全オリジナル予想問題と解答・解説を JSON で作成してください。\n"
        "・英文150〜250語、下線部 (ア)(イ) は passage 内で *アスタリスク* 記法。\n"
        "・複雑構文・指示語/省略を必ず含め、イには特定語を明らかにする追加指示（segmentIExtraInstructionJa）。\n"
        "・解答はこなれた日本語。構文解析・NG直訳・採点目安を segmentAnalyses / badTranslationExamples に記載。"
    )


def build_q4b_validator_user_prompt(*, problem_block: str) -> str:
    return f"""【作成された問題・解答】
{problem_block}

東大第4問(B)下線部和訳として成立しているか検証してください。
(ア)(イ)の下線、イの特定語指示、和訳の自然さ、解説の充実度を確認してください。"""


Q4B_VALIDATOR_SYSTEM_FALLBACK = """あなたは東京大学二次英語・第4問(B)下線部和訳の検証者です。

- passage が150〜250語程度で *...* 下線が (ア)(イ) 2箇所か
- 複雑構文・指示語/省略の要素があるか
- segmentIExtraInstructionJa に特定語を明らかにする指示があるか
- sampleAnswers が2件、segmentAnalyses が充実しているか

passed は issues が空なら true。

出力 JSON のみ:
{"passed": true, "issues": [], "summary": "..."}"""
