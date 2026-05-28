"""問題文の下線・空欄記法（フロントの question-text-format.tsx と一致）。"""

import re

# 和訳・英訳の対象語句
EMPHASIS_IN_PROMPT = re.compile(
    r"\*[^*\n]*[a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF][^*\n]*\*"
)
BLANK_MARKUP = re.compile(r"_{3,}|＿{2,}|\([ \u3000]+\)")

FORMATS_REQUIRING_TARGET_MARKUP = frozenset(
    {"underline", "composite", "english_composition", "japanese_writing"},
)

PROMPT_MARKUP_RULES = """
【問題文の下線・空欄記法 — 必須】
アプリでは次の記法だけが下線・空欄として表示されます。HTML の <u> や実際の下線文字は使わないこと。

1. 和訳・英訳・要約の「下線部」「強調する語句」
   → 対象を半角アスタリスクで囲む: *important decision* / *重要な決定*
   → 1語でも複数語でも、設問で指す英文・和文はすべて *...* で囲む

2. 記入用の空欄（答えを書く下線だけの場所）
   → ___ または ＿＿（3文字以上）

3. 括弧内の空欄
   → （　　　）（全角スペース）

4. 参照過去問の prompt に * や ___ がある場合
   → 生成する prompt でも同じ箇所・同程度の数だけ記法を再現する

5. answerFormat が underline / composite / english_composition / japanese_writing のとき
   → 「下線部を和訳・英訳・要約」などの指示がある設問では、本文中の該当箇所に必ず *...* を付ける

6. 長文読解・正誤問題（記述）でも、本文中で設問が指す語句・文節は *...* で明示する
""".strip()


def has_underline_markup(text: str) -> bool:
    if not text:
        return False
    return bool(BLANK_MARKUP.search(text) or EMPHASIS_IN_PROMPT.search(text))


def normalize_prompt_markup(text: str) -> str:
    """AI が返しがちな HTML 下線などをアプリ記法に寄せる。"""
    if not text:
        return ""

    out = text
    # <u>...</u> → *...*
    out = re.sub(
        r"<u>\s*([^<]+?)\s*</u>",
        lambda m: f"*{m.group(1).strip()}*",
        out,
        flags=re.IGNORECASE,
    )
    # Unicode 結合下線を除去（単語に * が無い場合の救済はしない）
    out = out.replace("\u0332", "").replace("\u0333", "")
    return out.strip()


def append_markup_reminder_if_needed(
    prompt: str,
    answer_format: str | None,
    notes: str,
) -> str:
    fmt = (answer_format or "").strip()
    if fmt not in FORMATS_REQUIRING_TARGET_MARKUP:
        return notes
    if has_underline_markup(prompt):
        return notes
    reminder = "要確認: 問題文に下線・空欄記法（*語句* または ___）がありません。エディタで追加してください。"
    if reminder in (notes or ""):
        return notes
    return f"{notes}\n{reminder}".strip() if notes else reminder
