"""エラータグの表示・集計用正規化（一般化カテゴリ）。"""

from __future__ import annotations

import re

# カルテ「ミス傾向」用の固定カテゴリ（問題固有の文言はここに集約しない）
GENERALIZED_ERROR_CATEGORIES: tuple[str, ...] = (
    "語彙ミス",
    "スペルミス",
    "訳し漏れ",
    "時制ミス",
    "文構造の誤り",
    "構造把握の弱さ",
    "指示未達",
    "構成の弱さ",
    "表記・記号",
    "具体性不足",
    "語順・表現",
    "その他",
)

_CATEGORY_SET = frozenset(GENERALIZED_ERROR_CATEGORIES)

# (キーワードのいずれかが含まれる, カテゴリ) — 先にマッチしたものを採用
_CATEGORY_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("訳し漏れ", "訳抜け", "訳漏", "抜け", "漏訳", "訳漏れ"), "訳し漏れ"),
    (("スペル", "綴り", "スペリング"), "スペルミス"),
    (("語彙", "単語選択", "ワードチョイス", "語彙選択"), "語彙ミス"),
    (("時制", "過去形", "未来形", "完了形", "時制の"), "時制ミス"),
    (("文構造", "構文", "倒置", "二重否定", "否定の"), "文構造の誤り"),
    (("構造把握", "論旨", "主旨把握", "読解", "論理構造"), "構造把握の弱さ"),
    (("構成", "段落", "段落構成", "論理展開"), "構成の弱さ"),
    (("指示未達", "語数", "字数", "語数不足", "字数不足", "要約"), "指示未達"),
    (
        (
            "具体性",
            "言及なし",
            "言及",
            "自己抑制",
            "テーマ",
            "内容不足",
            "論点",
            "主旨",
        ),
        "具体性不足",
    ),
    (("語順", "表現の", "不自然", "ぎこち", "コロケーション"), "語順・表現"),
    (("表記", "記号", "カンマ", "ピリオド", "スペルミス以外"), "表記・記号"),
    (("文法", "用法"), "文構造の誤り"),
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

    compact = re.sub(r"\s+", "", label)

    for keywords, category in _CATEGORY_RULES:
        for kw in keywords:
            if kw in label or kw in compact:
                return category

    return "その他"


def categorize_error_tags(tags: list[object]) -> list[str]:
    return [categorize_error_tag(t) for t in tags if str(t or "").strip()]


ERROR_TAGS_INSTRUCTION = (
    "errorTags は次の一般カテゴリから1〜3個だけ選ぶ（問題固有・テーマ固有の文言は禁止）: "
    + "、".join(GENERALIZED_ERROR_CATEGORIES)
)
