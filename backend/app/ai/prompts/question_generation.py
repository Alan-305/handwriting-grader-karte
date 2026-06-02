from app.ai.prompts.university_prompts import build_generation_system

# 後方互換（テスト等）
GENERATION_SYSTEM = build_generation_system("", "東京大学")


def build_generation_user_prompt(
    *,
    university_name: str,
    selections: list[dict],
    reference_context: str,
    difficulty: str,
    topic_hint: str,
    count_per_type: int,
    weakness_focus: str = "",
) -> str:
    selection_lines = []
    for sel in selections:
        selection_lines.append(
            f"- {sel.get('typeLabel')} (majorOrder={sel.get('majorOrder')}, partLabel={sel.get('partLabel')!r})"
        )

    topic_block = f"\n題材の方向性: {topic_hint}" if topic_hint.strip() else ""
    weakness_block = (
        f"\n\n【この生徒の弱点（カルテ由来。克服に効く出題を優先）】\n{weakness_focus}"
        if weakness_focus.strip()
        else ""
    )

    from app.ai.prompts.university_prompts import difficulty_label

    return f"""大学: {university_name}
難易度: {difficulty_label(difficulty)}
1型あたり {count_per_type} 問生成{topic_block}

生成する型:
{chr(10).join(selection_lines)}

【参照過去問（形式の手本）】
{reference_context}{weakness_block}

上記の型ごとに、過去問と同じ出題形式・技能だが内容は新規の問題文と模範解答を生成してください。
参照過去問の prompt に *語句* や ___ がある場合は、生成する prompt にも必ず同様の記法で下線・空欄を入れてください。"""
