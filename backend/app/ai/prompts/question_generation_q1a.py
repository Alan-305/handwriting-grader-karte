"""第1問(A)型（東大・英文要約）の生成プロンプト。"""

from app.ai.prompts.q5_format_guidance import format_reference_block
from app.ai.prompts.universities import _defaults
from app.ai.prompts.universities.registry import (
    build_q1a_generation_system,
    build_q1a_validator_system,
)

difficulty_label = _defaults.difficulty_label


def build_q1a_generation_user_prompt(
    *,
    topic_hint: str,
    difficulty: str,
    university_name: str = "",
    reference_context: str = "",
    source_passage: str = "",
) -> str:
    theme = topic_hint.strip() or "お任せ"
    source = (
        f"\n【素材となる英文（この英文を使用すること）】\n{source_passage.strip()}\n"
        if source_passage.strip()
        else ""
    )
    ref_block = format_reference_block(
        university_name=university_name,
        reference_context=reference_context.replace("第5問", "第1問(A)"),
    )
    uni_note = f"（{university_name}・第1問(A)水準）" if university_name.strip() else ""
    return (
        f"難易度: {difficulty_label(difficulty)}{uni_note}\n"
        f"テーマ: {theme}{source}{ref_block}\n"
        "上記に従い、東大第1問(A)・英文要約の完全オリジナル問題と解答・解説を JSON で作成してください。"
        "modelAnswerJa は句読点を含めて必ず70〜80字に収め、charCount に実字数を記載してください。"
    )


def build_q1a_validator_user_prompt(*, problem_block: str) -> str:
    return f"""【作成された問題・解答】
{problem_block}

東大第1問(A)として成立しているか検証してください。
特に modelAnswerJa の字数（70〜80字・句読点含む）と、英文の語数（300〜400語程度）を確認してください。"""


Q1A_VALIDATOR_SYSTEM_FALLBACK = """あなたは東京大学二次英語・第1問(A)英文要約の検証者です。

- 英文が300〜400語程度で、アカデミックな論理展開（導入→主張→具体例→結論）か
- 設問が「70〜80字の日本語で要約」形式か
- modelAnswerJa が70〜80字（句読点含む）に厳密に収まっているか
- 要約が具体例を削ぎ落とし、第一義的結論を押さえているか

passed は issues が空なら true。

出力 JSON のみ:
{"passed": true, "issues": [], "summary": "..."}"""
