"""第2問(B)型（東大・和文英訳）の生成プロンプト。"""

from app.ai.prompts.q5_format_guidance import format_reference_block
from app.ai.prompts.universities import _defaults
from app.ai.prompts.universities.registry import (
    build_q2b_generation_system,
    build_q2b_validator_system,
)

difficulty_label = _defaults.difficulty_label


def build_q2b_problem_user_prompt(
    *,
    topic_hint: str,
    difficulty: str,
    university_name: str = "",
    reference_context: str = "",
    fix_hint: str = "",
) -> str:
    base = build_q2b_generation_user_prompt(
        topic_hint=topic_hint,
        difficulty=difficulty,
        university_name=university_name,
        reference_context=reference_context,
    )
    extra = (
        "\n\n【第1段階 — 問題のみ】\n"
        "和文問題・下線部・解答例2つだけを JSON で返してください。"
        " 解説（wakuyakuProcessJa / segmentExplanations / badLiteralTranslations 等）は空にしてください。\n"
        "- sampleAnswers は **\"standard|解答例1（標準）|英文\"** と **\"paraphrase|解答例2（平易）|英文\"** 形式の文字列2件\n"
        "- japanesePassage 内の英訳対象は *アスタリスク* で囲む"
    )
    fix = f"\n\n【前回不合格 — 必ず修正】\n{fix_hint}" if fix_hint.strip() else ""
    return f"{base}{extra}{fix}"


def build_q2b_teacher_pack_user_prompt(*, problem_block: str, fix_hint: str = "") -> str:
    fix = f"\n\n【前回不合格 — 必ず修正】\n{fix_hint}" if fix_hint.strip() else ""
    return f"""【確定した和文英訳問題】
{problem_block}

上記問題に対する教師用解説を JSON で作成してください。
- segmentExplanations: **\"下線部|直訳の罠|英語的発想\"** 形式の文字列配列
- badLiteralTranslations: **\"NG英文|不自然な理由|言い換えの目安\"** 形式の文字列配列（2件以上）
- grammarEssentialsJa / commonMistakesJa は日本語文字列の配列
- wakuyakuProcessJa は和文和訳の全体プロセス（日本語・簡潔）{fix}"""


def build_q2b_generation_user_prompt(
    *,
    topic_hint: str,
    difficulty: str,
    university_name: str = "",
    reference_context: str = "",
) -> str:
    theme = topic_hint.strip() or "お任せ"
    ref_block = format_reference_block(
        university_name=university_name,
        reference_context=reference_context.replace("第5問", "第2問(B)"),
    )
    uni_note = f"（{university_name}・第2問(B)水準）" if university_name.strip() else ""
    return (
        f"難易度: {difficulty_label(difficulty)}{uni_note}\n"
        f"テーマ・場面: {theme}{ref_block}\n"
        "上記に従い、東大第2問(B)・和文英訳の完全オリジナル予想問題と解答・解説を JSON で作成してください。\n"
        "・japanesePassage 内の英訳対象（2〜3文程度）は必ず *アスタリスク* で囲む（アプリの下線表示用）。\n"
        "・直訳では不自然になる比喩・慣用句・省略を下線部に含めること。\n"
        "・解答例1（標準的な訳）と解答例2（平易なパラフレーズ）の2パターン、NG直訳例も必ず含めること。"
    )


def build_q2b_validator_user_prompt(*, problem_block: str) -> str:
    return f"""【作成された問題・解答】
{problem_block}

東大第2問(B)和文英訳として成立しているか検証してください。
下線部の質（直訳の罠）、解答例2パターン、NG訳の解説を確認してください。"""


Q2B_VALIDATOR_SYSTEM_FALLBACK = """あなたは東京大学二次英語・第2問(B)和文英訳の検証者です。

- japanesePassage に *...* 下線記法があり、英訳対象が2〜3文程度か
- 比喩・慣用句など直訳の罠があるか
- sampleAnswers が2件（標準的訳とパラフレーズ）か
- badLiteralTranslations が具体的か

passed は issues が空なら true。

出力 JSON のみ:
{"passed": true, "issues": [], "summary": "..."}"""
