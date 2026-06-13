"""エラータグの表示・集計用正規化（一般化カテゴリ）。"""

from __future__ import annotations

import re

# カルテ「ミス傾向」用の固定カテゴリ（重大→軽微の順。問題固有の文言は集約しない）
GENERALIZED_ERROR_CATEGORIES: tuple[str, ...] = (
    "誤情報の混入",
    "該当箇所のズレ",
    "内容説明不足",
    "句・節の把握ミス",
    "修飾先の取り違え",
    "文構造の誤り",
    "時制・仮定法・助動詞",
    "誤訳・脱訳",
    "語彙ミス",
    "選択の誤り",
    "スペルミス",
    "その他",
)

_CATEGORY_SET = frozenset(GENERALIZED_ERROR_CATEGORIES)

# 旧カテゴリ名 → 新カテゴリ（既存セッションの再集計用）
_LEGACY_CATEGORY_MAP: dict[str, str] = {
    "訳し漏れ": "誤訳・脱訳",
    "時制ミス": "時制・仮定法・助動詞",
    "具体性不足": "内容説明不足",
    "構造把握の弱さ": "句・節の把握ミス",
    "構成の弱さ": "内容説明不足",
    "語順・表現": "文構造の誤り",
    "構文の取り違え": "文構造の誤り",
    "表記・記号": "選択の誤り",
    "指示未達": "その他",
}

# (キーワードのいずれかが含まれる, カテゴリ) — 先にマッチしたものを採用
_CATEGORY_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("誤情報", "誤った情報", "事実誤認", "混入", "誤った記述"), "誤情報の混入"),
    (
        ("該当箇所", "根拠段落", "段落の取り", "本文のズレ", "引用箇所", "根拠の"),
        "該当箇所のズレ",
    ),
    (
        (
            "内容説明",
            "説明不足",
            "説明が不十分",
            "具体性",
            "言及なし",
            "言及",
            "論点",
            "内容不足",
            "論述",
            "自己抑制",
            "テーマ",
            "主旨",
            "構成の弱さ",
        ),
        "内容説明不足",
    ),
    (
        (
            "時制",
            "過去形",
            "未来形",
            "完了形",
            "仮定法",
            "助動詞",
            "would",
            "should",
            "could",
        ),
        "時制・仮定法・助動詞",
    ),
    (("修飾", "係り受け", "修飾関係", "修飾先"), "修飾先の取り違え"),
    (("句", "節", "関係代名詞", "分詞構文", "構造把握", "論旨把握"), "句・節の把握ミス"),
    (
        (
            "構文",
            "言い換え",
            "語順",
            "不自然",
            "ぎこち",
            "コロケーション",
            "語順・表現",
            "文構造",
            "構文誤",
            "倒置",
            "二重否定",
            "否定の",
            "文法",
            "用法",
        ),
        "文構造の誤り",
    ),
    (("誤訳", "脱訳", "訳し漏れ", "訳抜け", "訳漏", "漏訳", "訳漏れ", "訳の"), "誤訳・脱訳"),
    (("スペル", "綴り", "スペリング"), "スペルミス"),
    (("語彙", "単語選択", "ワードチョイス", "語彙選択"), "語彙ミス"),
    (("語数", "字数", "語数不足", "字数不足", "要約"), "内容説明不足"),
    (("選択", "記号", "空所", "表記", "カンマ", "ピリオド"), "選択の誤り"),
)


def normalize_error_tag(raw: object) -> str:
    """括弧内の補足を除去（表示用）。"""
    label = str(raw or "").strip()
    if not label:
        return "その他"

    for sep in ("（", "("):
        idx = label.find(sep)
        if idx >= 0:
            label = label[:idx].strip()
            break

    return label or "その他"


def categorize_error_tag(raw: object) -> str:
    """自由記述タグを一般化カテゴリにマッピング。"""
    label = normalize_error_tag(raw)
    if label in _CATEGORY_SET:
        return label

    if label in _LEGACY_CATEGORY_MAP:
        return _LEGACY_CATEGORY_MAP[label]

    compact = re.sub(r"\s+", "", label)

    for keywords, category in _CATEGORY_RULES:
        for kw in keywords:
            if kw in label or kw in compact:
                return category

    return "その他"


def categorize_error_tags(tags: list[object]) -> list[str]:
    return [categorize_error_tag(t) for t in tags if str(t or "").strip()]


ERROR_TAGS_CATEGORY_GUIDE = """
カテゴリの選び方（該当するものだけ1〜3個。上ほど重大）:
- 誤情報の混入: 正しい部分があっても誤った情報が答えに混ざっている（部分点でも指摘）
- 該当箇所のズレ: 解答の根拠となる本文箇所の取り違え
- 内容説明不足: 内容説明・論述が浅い、具体性不足
- 句・節の把握ミス: 句や節の範囲・結合の誤り
- 修飾先の取り違え: 修飾関係・係り受けの取り違え
- 文構造の誤り: 文の構文・語法の誤り、言い換え・構文解釈の取り違え
- 時制・仮定法・助動詞: 時制、仮定法、助動詞の訳出・用法
- 誤訳・脱訳: 単語・語句レベルの誤訳、訳漏れ、脱訳
- 語彙ミス: 語彙選択・意味の取り違え（誤訳と重ならない場合）
- 選択の誤り: 記号・選択式の誤答
- スペルミス: 綴り・表記の誤り
""".strip()

ERROR_TAGS_INSTRUCTION = (
    "errorTags は次の一般カテゴリから1〜3個だけ選ぶ（問題固有・テーマ固有の文言は禁止）: "
    + "、".join(GENERALIZED_ERROR_CATEGORIES)
    + "。"
    + ERROR_TAGS_CATEGORY_GUIDE
    + " 選んだカテゴリは講評または解説（丸数字のいずれか）で自然に一言触れ、"
    "ミス傾向と説明が一致するようにする。部分点でも誤情報の混入・該当箇所のズレは指摘すること。"
)
