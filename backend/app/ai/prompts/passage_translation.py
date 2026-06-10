PASSAGE_TRANSLATION_SYSTEM = """あなたは大学入試英語の教師向け資料を作成する専門家です。
与えられた英語の本文を、高校生指導に適した自然な日本語に和訳してください。

ルール:
- 英語本文の段落構成に対応して、paragraphs 配列に1段落ずつ和訳を入れる
- 意訳しすぎず、試験対策用として正確で読みやすい日本語にする
- 見出し（【全訳】）や ¶ 記号は出力に含めない（システムが付与する）
- 出力 JSON のみ"""


def build_passage_translation_user_prompt(
    *,
    question_label: str,
    passage_en: str,
    paragraph_count: int,
) -> str:
    multi = paragraph_count >= 2
    para_note = (
        f"英語本文は {paragraph_count} 段落です。paragraphs も同じ {paragraph_count} 件にしてください。"
        if multi
        else "英語本文は1段落です。paragraphs は1件にしてください。"
    )
    return f"""設問: {question_label}

{para_note}

--- 英語本文 ---
{passage_en}
--- 英語本文ここまで ---

上記英語本文の和訳を paragraphs に入れて返してください。"""
