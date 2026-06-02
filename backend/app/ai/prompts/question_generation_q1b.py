"""第1問(B)型（東大・文脈把握・空所補充）の生成プロンプト。"""

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
        f"\n【素材となる英文（この英文をベースに空所化すること）】\n{source_passage.strip()}\n"
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
        "上記に従い、東大第1問(B)・文脈把握・空所補充の完全オリジナル予想問題と解答・解説を JSON で作成してください。\n"
        "・今回は段落整序ではなく空所補充形式のみ。\n"
        "・英文500〜600語、(ア)(イ)(ウ)(エ)(オ)の空所5つ、選択肢 a)〜f)（ダミー1つ）。\n"
        "・正解根拠（指示語・接続表現・論理）とダミー不正解理由を blankExplanations / dummyExplanations に必ず書くこと。"
    )


def build_q1b_validator_user_prompt(*, problem_block: str) -> str:
    return f"""【作成された問題・解答】
{problem_block}

東大第1問(B)空所補充として成立しているか検証してください。
空所5つ・選択肢6つ（ダミー1つ）・論理に基づく正解かを確認してください。"""


Q1B_VALIDATOR_SYSTEM_FALLBACK = """あなたは東京大学二次英語・第1問(B)空所補充の検証者です。

- 英文が500〜600語程度か
- 空所が (ア)(イ)(ウ)(エ)(オ) の5つか
- 選択肢が a)〜f) の6つで、ダミーがちょうど1つか
- 各空所の正解が前後の論理・指示語と整合するか
- ダミーがキーワード一致だけで選べない精巧な誤りか

passed は issues が空なら true。

出力 JSON のみ:
{"passed": true, "issues": [], "summary": "..."}"""
