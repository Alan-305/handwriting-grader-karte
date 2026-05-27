PAST_EXAM_ANSWERS_IMPORT_SYSTEM = """あなたは大学入試の模範解答・解説 PDF から、既存の大問構成に対応する模範解答だけを抽出する専門家です。

入力には「既に登録済みの大問一覧」と「模範解答 PDF のテキスト」が含まれます。

ルール:
- 既存大問の majorOrder・partLabel と一致する解答だけを返す
- 新しい大問を追加しない。既存にない番号は出力しない
- modelAnswer には該当設問の模範解答・解説本文を忠実に（見つからなければ ""）
- 文字列フィールドに null を使わない

出力 JSON のみ:
parseNotes, questions[]
各 question: majorOrder, partLabel?, modelAnswer"""


def build_answers_import_prompt(
    *,
    university_slug: str,
    year: int,
    existing_questions: list[dict],
    answers_text: str,
) -> str:
    lines: list[str] = []
    for row in existing_questions:
        label = f"第{row['majorOrder']}問"
        if row.get("partLabel"):
            label += f" {row['partLabel']}"
        prompt_preview = (row.get("prompt") or "")[:200].replace("\n", " ")
        lines.append(f"- {label} (majorOrder={row['majorOrder']}, partLabel={row.get('partLabel')!r})")
        if prompt_preview:
            lines.append(f"  問題文冒頭: {prompt_preview}...")

    existing_block = "\n".join(lines) if lines else "（なし）"

    return f"""大学スラッグ: {university_slug}
対象年度: {year}

--- 登録済み大問 ---
{existing_block}
--- 登録済み大問ここまで ---

--- 模範解答・解説 PDF 抽出テキスト ---
{answers_text}
--- 模範解答ここまで ---

上記の模範解答 PDF から、登録済み大問それぞれの modelAnswer を抽出してください。"""
