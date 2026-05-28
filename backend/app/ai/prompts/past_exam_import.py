PAST_EXAM_IMPORT_SYSTEM = """あなたは大学入試の過去問題PDFから、設問を構造化データに分解する専門家です。

入力はPDFから抽出したテキストです。東京大学二次試験英語を想定します。

【分割単位 — 最重要】
- 「第1問」から始まる**大問見出しごと**に分割する（東大英語など **第5問まで**ある年度は第5問も必ず含める）
- **問題用紙に第5問があるのに questions から除外してはならない**（本文が途中で切れていても省略しない）
- 本文が不完全でも majorOrder=5 のエントリを作り、読めた範囲を prompt に入れ、不足は notes に「要確認（本文途切れ）」と書く
- OCRのページ区切り（--- Pages 1-8 --- 等）や行単位で分割してはならない
- 第2問・第3問内の短答 (1)(2)(3)(4) は、必要な場合のみ partLabel 付きで別エントリ
- 目安: questions は 5〜15 件程度（大問＋必要な小問）。40件以上に増やさない

ルール:
- **必ず `prompt` フィールドに**問題文・指示文・英語本文をすべて入れる（別フィールドだけに書かない）
- prompt を空にしたり、メタデータだけにしない。読めない場合のみ notes に「要確認」
- 読解・リスニング設問では、指示文だけでなく **英語の本文・会話文・長文を省略せず全文** を prompt に含める
  （「次の英文を読み」等の指示の直後に続く英語段落もすべて含める。要約用の和文だけにしない）
- modelAnswer も **必ず `modelAnswer` フィールド**に入れる（解答 PDF から対応する解答・解説を全文）
- 和訳・要約・記述の指示（日本語）と英語本文が同じ大問にある場合は、同一の prompt にまとめる
- modelAnswer は模範解答PDFから対応する解答。なければ ""
- type: english / japanese / symbol
- majorOrder は大問番号（1, 2, 3, 4, 5 …。PDF に現れる最大の大問番号まで）
- points は明示されていれば数値、なければ null
- notes は補足のみ。不要なら ""（null 禁止）
- 文字列フィールドに null を使わない

【answerFormat — 解答方式（UI表示用・最重要）】
- japanese_writing: 日本語記述（和文要約・和訳・百字記述など）
- english_writing: 英語記述（英作文・英訳・語句並べ替えなど）
- symbol: 記号・マークシート式
- composite: 総合問題（記述と記号など複数方式が1エントリに混在）
※ 科目名（英語/国語）ではなく、生徒の解答方式で選ぶこと

【type — 内部用・添削エンジン向け】
- answerFormat から自動設定可。英語入試の japanese_writing も type は english

【リスニング脚本】
- 別PDFで取り込む場合、questions に脚本本文を含めない。listeningScripts は []
- リスニング「設問」（問題用紙上の第○問）は questions として扱う

出力 JSON のみ:
universityName, year, examType, parseNotes, questions[], listeningScripts[]
各 question に answerFormat（japanese_writing / english_writing / symbol / composite）を必ず含める"""


def build_past_exam_import_prompt(
    *,
    university_slug: str,
    year: int,
    exam_text: str,
    answers_text: str | None = None,
    separate_listening_pdf: bool = False,
) -> str:
    answers_block = ""
    if answers_text:
        answers_block = f"""
--- 模範解答・解説 PDF 抽出テキスト ---
{answers_text}
--- 模範解答ここまで ---
"""
    listening_note = ""
    if separate_listening_pdf:
        listening_note = (
            "\n※ リスニング脚本は別PDFで取り込みます。"
            "listeningScripts は空配列 [] にし、問題用紙上の大問（第5問を含む）を questions に出力してください。"
        )
    return f"""大学スラッグ: {university_slug}
対象年度: {year}

--- 問題用紙 PDF 抽出テキスト ---
{exam_text}
--- 問題用紙ここまで ---
{answers_block}
上記から過去問を構造化してください。{listening_note}"""
