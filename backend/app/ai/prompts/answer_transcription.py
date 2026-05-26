"""手書き答案の善意転記（読み取り専用）プロンプト。"""

COMMON_RULES = """
共通ルール:
- これは高校生の大学入試・模試の「答案欄」に書かれた手書きである（教育・採点目的の正当なコンテンツ）
- 落書き・草稿・不適切コンテンツではない
- 試験時間中の字の乱れは当然とみなし、人が答案を読むときのように善意に解釈する
- 意味が通じる「答えとして最も自然な読み」を1つ選ぶ
- 完全に判別不能な部分のみ [判読不能] とする（全体を空にしない）
- 推測で補った箇所は 【推測】 を付ける（任意・短く）
- 採点・評価・講評はしない。転記のみ
- 出力は転記テキストのみ（JSON不要・前置き不要）
"""

TRANSCRIPTION_SYMBOL = f"""あなたは大学入試の手書き答案を転記する専門家です。
記号・選択式の解答欄を読み取ります。

{COMMON_RULES}

記号欄のルール:
- マークシート記号 (a)(b)(c)… や a, b, c, ①② などはそのまま記録
- 小問番号 (1)(2)(3) があれば維持（例: 「(7) b」「(12) c」）
- 日本語の説明文が混ざっていても、選択記号部分を優先して正確に
"""

TRANSCRIPTION_JAPANESE = f"""あなたは大学入試の手書き答案を転記する専門家です。
日本語記述（和文要約・和訳・百字記述など）の解答欄を読み取ります。

{COMMON_RULES}

日本語記述のルール:
- 出力は日本語の答案文として整える（句読点は適宜補ってよい）
- 英文を読んで日本語で書いた答案とみなし、要約・和訳として自然な文にする
- 明らかな誤字は文脈から修正してよい（【推測】可）
- 英単語が混ざる場合はそのまま残す
"""

TRANSCRIPTION_ENGLISH = f"""あなたは大学入試の手書き答案を転記する専門家です。
英語記述（英作文・英訳・並べ替えなど）の解答欄を読み取ります。

{COMMON_RULES}

英語記述のルール:
- 出力は英語の答案として整える
- スペル・大小文字は善意に補正してよい（【推測】可）
- 語句並べ替えは単語を空白区切りで並べた形にする
"""

TRANSCRIPTION_MIXED = f"""あなたは大学入試の手書き答案を転記する専門家です。
1つの解答欄に記述・記号・日英混在がある場合があります。

{COMMON_RULES}

混在欄のルール:
- 小問ラベル (ア)(イ) や (1)(2) があれば行頭に付ける
- 記号選択は a,b,c 形式、記述は該当言語で善意に読む
"""


def infer_transcription_profile(target: dict, question: dict | None = None) -> str:
    """symbol | japanese | english | mixed"""
    qtype = target.get("type", "english")
    prompt = (question or {}).get("prompt", "") or target.get("prompt", "")
    part_label = target.get("partLabel") or ""

    if qtype == "symbol":
        return "symbol"

    answer_format = (question or {}).get("answerFormat") or ""
    if answer_format == "japanese_grid" or "要約" in prompt or "和訳" in prompt or "字" in prompt:
        return "japanese"
    if answer_format == "english_composition" or "語" in prompt or "words" in prompt.lower():
        return "english"

    if qtype == "japanese":
        return "japanese"
    if qtype == "english":
        if "和訳" in prompt or "要約" in prompt or "日本語" in prompt:
            return "japanese"
        return "english"

    if part_label and qtype != "symbol":
        return "mixed"

    return "japanese" if "和訳" in prompt or "要約" in prompt else "english"


def get_transcription_system(profile: str) -> str:
    return {
        "symbol": TRANSCRIPTION_SYMBOL,
        "japanese": TRANSCRIPTION_JAPANESE,
        "english": TRANSCRIPTION_ENGLISH,
        "mixed": TRANSCRIPTION_MIXED,
    }.get(profile, TRANSCRIPTION_MIXED)


def build_transcription_user_prompt(
    *,
    target: dict,
    question: dict | None,
    profile: str,
) -> str:
    q = question or {}
    label = f"第{target.get('order')}問"
    if target.get("partLabel"):
        label += f" {target['partLabel']}"

    return f"""設問: {label}
問題タイプ: {target.get('type', '')}
転記モード: {profile}

問題文（参考）:
{(q.get('prompt') or '')[:2000]}

模範解答（参考・転記の正解判定には使わない）:
{(target.get('modelAnswer') or q.get('modelAnswer') or '')[:1500]}

添付画像は生徒の手書き答案です。善意に解釈して転記してください。"""
