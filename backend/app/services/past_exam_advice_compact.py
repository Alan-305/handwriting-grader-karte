"""過去問アドバイスのコンパクト化（設問別・面談要点の除去）。"""

from __future__ import annotations

MAX_ADVICE_CARDS = 3


def compact_past_exam_advice_payload(payload: dict) -> dict:
    """生成結果を印刷向けコンパクト形式に正規化する。"""
    compact = dict(payload)
    compact["questionInsights"] = []
    compact["teacherTalkingPoints"] = []
    cards = compact.get("adviceCards") or []
    if isinstance(cards, list):
        compact["adviceCards"] = cards[:MAX_ADVICE_CARDS]
    return compact
