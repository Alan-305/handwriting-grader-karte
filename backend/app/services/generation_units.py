"""過去問カタログを「生成単位」にまとめるルール。

- 第1問: (A)(B) などアルファベット小問は別単位
- 第2〜4問: 大問1単位（(1)(2)… は生成結果の中身）
- 第4問(A): 誤り指摘専用パイプライン（q4a）
- 第5問: 常に1単位（本文・設問(1)〜(5) は生成結果の中身）
"""

from __future__ import annotations

import re
from typing import Any

_MINOR_PART = re.compile(r"^\(\d+\)$")
_LETTER_PART = re.compile(r"^\([A-Za-z]\)$")


def _part_label_str(part_label: str | None) -> str:
    return (part_label or "").strip()


def is_body_part_label(part_label: str | None) -> bool:
    return _part_label_str(part_label) in ("", "本文")


def is_numeric_sub_part(part_label: str | None) -> bool:
    label = _part_label_str(part_label)
    return bool(label and _MINOR_PART.match(label))


def is_letter_sub_part(part_label: str | None) -> bool:
    label = _part_label_str(part_label)
    return bool(label and _LETTER_PART.match(label))


def is_q4a_part_label(part_label: str | None) -> bool:
    label = _part_label_str(part_label).upper()
    return label in ("(A)", "A")


def generation_unit_key(major_order: int, part_label: str | None = None) -> str:
    if major_order == 1 and is_letter_sub_part(part_label):
        return f"1:{_part_label_str(part_label)}"
    return f"{major_order}:"


def catalog_to_generation_units(catalog: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """list_question_types の行を生成単位に集約する。"""
    if not catalog:
        return []

    by_major: dict[int, list[dict[str, Any]]] = {}
    for row in catalog:
        major = int(row.get("majorOrder") or 0)
        if major <= 0:
            continue
        by_major.setdefault(major, []).append(row)

    units: list[dict[str, Any]] = []

    for major in sorted(by_major.keys()):
        rows = by_major[major]

        if major == 1:
            letter_rows = [r for r in rows if is_letter_sub_part(r.get("partLabel"))]
            if letter_rows:
                for r in sorted(letter_rows, key=lambda x: str(x.get("partLabel") or "")):
                    units.append(_unit_from_rows(major, [r], r.get("partLabel")))
                continue
            units.append(_unit_from_rows(major, rows, None))
            continue

        if major >= 5:
            body_rows = [r for r in rows if is_body_part_label(r.get("partLabel"))]
            source = body_rows if body_rows else rows
            units.append(_unit_from_rows(major, source, None))
            continue

        if major == 4:
            q4a_rows = [r for r in rows if is_q4a_part_label(r.get("partLabel"))]
            if q4a_rows:
                units.append(_unit_from_rows(major, q4a_rows, "(A)", pipeline="q4a"))
            other = [r for r in rows if not is_q4a_part_label(r.get("partLabel"))]
            if other:
                primary = [r for r in other if not is_numeric_sub_part(r.get("partLabel"))]
                source = primary if primary else other
                units.append(_unit_from_rows(major, source, None))
            continue

        # 第2〜3問など: 数値小問はまとめる
        primary = [r for r in rows if not is_numeric_sub_part(r.get("partLabel"))]
        source = primary if primary else rows
        units.append(_unit_from_rows(major, source, None))

    return units


def _unit_from_rows(
    major_order: int,
    rows: list[dict[str, Any]],
    part_label: str | None,
    *,
    pipeline: str | None = None,
) -> dict[str, Any]:
    years: set[int] = set()
    sample_ids: list[str] = []
    catalog_keys: list[str] = []

    for r in rows:
        for y in r.get("years") or []:
            years.add(int(y))
        for sid in r.get("sampleQuestionIds") or []:
            if sid and sid not in sample_ids:
                sample_ids.append(sid)
        key = f"{r.get('majorOrder')}:{r.get('partLabel') or ''}"
        if key not in catalog_keys:
            catalog_keys.append(key)

    from app.services.question_type_labels import format_type_label

    label = format_type_label(major_order, part_label)
    if pipeline is None:
        pipeline = "q5" if major_order == 5 else "generic"

    return {
        "majorOrder": major_order,
        "partLabel": part_label,
        "typeLabel": label,
        "unitKey": generation_unit_key(major_order, part_label),
        "years": sorted(years, reverse=True),
        "sampleQuestionIds": sample_ids[:6],
        "catalogKeys": catalog_keys,
        "pipeline": pipeline,
    }
