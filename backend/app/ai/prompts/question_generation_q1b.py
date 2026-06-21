"""第1問(B)型（東大・空所補充＋語句並べ替え）の生成プロンプト。"""

from app.ai.prompts.q5_format_guidance import format_reference_block
from app.ai.prompts.universities import _defaults
from app.ai.prompts.universities.registry import (
    build_q1b_generation_system,
    build_q1b_validator_system,
)

difficulty_label = _defaults.difficulty_label


def build_q1b_generation_user_prompt(
    *,
    topic_hint: str,
    difficulty: str,
    university_name: str = "",
    reference_context: str = "",
    source_passage: str = "",
) -> str:
    theme = topic_hint.strip() or "お任せ"
    source = (
        f"\n【素材となる英文（小問（ア）のベースに使用すること）】\n{source_passage.strip()}\n"
        if source_passage.strip()
        else ""
    )
    ref_block = format_reference_block(
        university_name=university_name,
        reference_context=reference_context.replace("第5問", "第1問(B)"),
    )
    uni_note = f"（{university_name}・第1問(B)水準）" if university_name.strip() else ""
    return (
        f"難易度: {difficulty_label(difficulty)}{uni_note}\n"
        f"テーマ: {theme}{source}{ref_block}\n"
        "上記に従い、東大第1問(B)の完全オリジナル予想問題と解答・解説を JSON で作成してください。\n"
        "・小問（ア）: 500〜600語・空所(1)〜(5)・選択肢 a)〜f)（ダミー1つ）。正解記号の重複禁止。\n"
        "・小問（イ）: 長文の空所（イ）・語句8〜12個の並べ替え（句・節が絡む箇所）。\n"
        "・partA / partI に解答・解説を必ず含めること。"
    )


def build_q1b_validator_user_prompt(*, problem_block: str) -> str:
    return f"""【作成された問題・解答】
{problem_block}

東大第1問(B)（小問ア・イ）として成立しているか検証してください。"""


Q1B_VALIDATOR_SYSTEM_FALLBACK = """あなたは東京大学二次英語・第1問(B)の検証者です。

【小問（ア）】
- 英文500〜600語程度、空所 (1)〜(5) が5つ
- 選択肢 a)〜f) の6つ、ダミー1つ
- 5空所の正解記号が互いに重複しない
- 論理・指示語に基づく正解、精巧なダミー

【小問（イ）】
- 長文に空所 (イ)
- wordBank 8〜12個、correctOrder が整合
- 句・節の構造理解が必要な並べ替え

passed は issues が空なら true。

出力 JSON のみ:
{"passed": true, "issues": [], "summary": "..."}"""
