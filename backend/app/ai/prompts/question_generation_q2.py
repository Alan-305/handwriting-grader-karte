"""第2問型（読解総合・札幌医大など）の生成プロンプト。"""

from app.ai.prompts.q5_format_guidance import format_reference_block
from app.ai.prompts.universities import _defaults

difficulty_label = _defaults.difficulty_label


def build_q2_generation_user_prompt(
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
        reference_context=reference_context.replace("第5問", "第2問"),
    )
    uni_note = f"（{university_name}・第2問水準）" if university_name.strip() else ""
    return (
        f"難易度: {difficulty_label(difficulty)}{uni_note}\n"
        f"テーマ: {theme}{source}{ref_block}\n"
        "上記に従い、大問2（読解総合）の完全オリジナル問題・解答例・解説を JSON で作成してください。"
        "対話文補充問題は含めないでください。"
    )


def build_q2_validator_user_prompt(*, problem_block: str) -> str:
    return f"""【作成された問題・解答】
{problem_block}

大問2（読解総合）として成立しているか検証してください。
特に英文の語数（1,000〜1,200語程度）、問1〜問6の技能構成、問6の解答例2パターンを確認してください。"""


Q2_VALIDATOR_SYSTEM_FALLBACK = """あなたは英語入試・大問2（読解総合）の検証者です。
語数・設問構成・模範解答の根拠を検証してください。passed は issues が空なら true。
出力 JSON のみ:
{"passed": true, "issues": [], "summary": "..."}"""
