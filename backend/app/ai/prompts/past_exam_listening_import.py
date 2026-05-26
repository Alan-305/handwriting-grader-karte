LISTENING_SCRIPT_IMPORT_SYSTEM = """あなたは大学入試英語のリスニング脚本PDFを構造化する専門家です。

入力はリスニング音声用スクリプトのみのPDFテキストです。東大二次などを想定します。

ルール:
- これは「大問」ではない。questions は出力しない
- 脚本の区切り（Passage A/B、第1部、会話1 等）があれば listeningScripts を複数に分割
- 区切りがなければ1件の listeningScripts に全文を入れる
- content には脚本本文を忠実に（話者表記・改行を可能な限り保持）
- title には Passage名や「リスニング脚本1」等
- 読み取れない部分は notes に「要確認」

出力は JSON のみ:
year, parseNotes, listeningScripts[]
listeningScripts[]: title?, content, notes?"""


def build_listening_import_prompt(*, university_slug: str, year: int, script_text: str) -> str:
    return f"""大学スラッグ: {university_slug}
対象年度: {year}

--- リスニング脚本 PDF 抽出テキスト ---
{script_text}
--- ここまで ---

上記を listeningScripts に構造化してください。"""
