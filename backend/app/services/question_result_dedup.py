"""question_results の重複を検出・解消する。

並行した読み取りリクエストなどで同一 (questionId, partIndex) が複数できる。
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any


def result_identity_key(result: dict) -> tuple[str | None, int]:
    return (result.get("questionId"), int(result.get("partIndex") or 0))


def _timestamp_value(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, datetime):
        return value.timestamp()
    if hasattr(value, "timestamp"):
        try:
            return float(value.timestamp())
        except (TypeError, ValueError, OSError):
            return 0.0
    return 0.0


def pick_best_duplicate(rows: list[dict]) -> dict:
    """同一キーの重複のうち、採点済み・更新が新しいものを優先する。"""
    def rank(row: dict) -> tuple[int, float, float]:
        graded = 1 if row.get("graded") else 0
        updated = _timestamp_value(row.get("updatedAt"))
        created = _timestamp_value(row.get("createdAt"))
        return (graded, updated, created)

    return max(rows, key=rank)


def group_duplicates(results: list[dict]) -> dict[tuple[str | None, int], list[dict]]:
    groups: dict[tuple[str | None, int], list[dict]] = defaultdict(list)
    for row in results:
        groups[result_identity_key(row)].append(row)
    return groups


def find_duplicate_ids(results: list[dict]) -> list[str]:
    """削除対象の result id 一覧（保持する1件を除く）。"""
    to_delete: list[str] = []
    for group in group_duplicates(results).values():
        if len(group) <= 1:
            continue
        keep = pick_best_duplicate(group)
        for row in group:
            if row.get("id") != keep.get("id"):
                rid = row.get("id")
                if rid:
                    to_delete.append(rid)
    return to_delete
