"""過去問カタログを「生成単位」にまとめるルール。

- 第1問: (A)(B) などアルファベット小問は別単位
- 第2問: (A) 自由英作文（q2a）、(B) 和文英訳（q2b）
- 第2〜4問: その他は大問1単位（(1)(2)… は生成結果の中身）
- 第4問: (A) 誤り指摘（q4a）、(B) 下線部和訳（q4b）
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


def is_q1a_part_label(part_label: str | None) -> bool:
    label = _part_label_str(part_label).upper()
    return label in ("(A)", "A")


def is_q1b_part_label(part_label: str | None) -> bool:
    label = _part_label_str(part_label).upper()
    return label in ("(B)", "B")


def is_q2a_part_label(part_label: str | None) -> bool:
    label = _part_label_str(part_label).upper()
    return label in ("(A)", "A")


def is_q2b_part_label(part_label: str | None) -> bool:
    label = _part_label_str(part_label).upper()
    return label in ("(B)", "B")


def is_q4b_part_label(part_label: str | None) -> bool:
    """第4問の (B) 小問（major_order=4 と併用）。"""
    label = _part_label_str(part_label).upper()
    return label in ("(B)", "B")


def _part_sort_key(part_label: str | None) -> tuple[int, str]:
    """大問内の並び: 本文 < (A)(B)… < (1)(2)… < その他。"""
    pl = _part_label_str(part_label).upper()
    if pl in ("", "本文"):
        return (0, "")
    if _LETTER_PART.match(pl):
        return (1, pl)
    if _MINOR_PART.match(pl):
        return (2, pl)
    return (3, pl)


def sort_generation_units(units: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """UI 用: 大問番号の若い順 → 小問ラベル (A)(B)(1)… の順。"""
    return sorted(
        units,
        key=lambda u: (
            int(u.get("majorOrder") or 0),
            _part_sort_key(u.get("partLabel")),
        ),
    )


def pipeline_for_selection(major_order: int, part_label: str | None = None) -> str:
    """生成単位の pipeline 名（q1a / q1b / q2a / q2b / q4a / q4b / q5 / generic）。"""
    if major_order == 5:
        return "q5"
    if major_order == 4 and is_q4a_part_label(part_label):
        return "q4a"
    if major_order == 4 and is_q4b_part_label(part_label):
        return "q4b"
    if major_order == 2 and is_q2a_part_label(part_label):
        return "q2a"
    if major_order == 2 and is_q2b_part_label(part_label):
        return "q2b"
    if major_order == 2:
        return "q2"
    if major_order == 1 and is_q1a_part_label(part_label):
        return "q1a"
    if major_order == 1 and is_q1b_part_label(part_label):
        return "q1b"
    if major_order == 1:
        return "q1"
    return "generic"


def generation_unit_key(major_order: int, part_label: str | None = None) -> str:
    if major_order in (1, 2, 4) and is_letter_sub_part(part_label):
        return f"{major_order}:{_part_label_str(part_label)}"
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
                    pl = r.get("partLabel")
                    units.append(
                        _unit_from_rows(
                            major,
                            [r],
                            pl,
                            pipeline=pipeline_for_selection(major, pl),
                        )
                    )
                continue
            units.append(_unit_from_rows(major, rows, None, pipeline="q1"))
            continue

        if major >= 5:
            body_rows = [r for r in rows if is_body_part_label(r.get("partLabel"))]
            source = body_rows if body_rows else rows
            units.append(_unit_from_rows(major, source, None))
            continue

        if major == 2:
            letter_rows = [r for r in rows if is_letter_sub_part(r.get("partLabel"))]
            if letter_rows:
                for r in sorted(letter_rows, key=lambda x: str(x.get("partLabel") or "")):
                    pl = r.get("partLabel")
                    units.append(
                        _unit_from_rows(
                            major,
                            [r],
                            pl,
                            pipeline=pipeline_for_selection(major, pl),
                        )
                    )
                continue
            units.append(_unit_from_rows(major, rows, None, pipeline="q2"))
            continue

        if major == 4:
            letter_rows = [r for r in rows if is_letter_sub_part(r.get("partLabel"))]
            if letter_rows:
                for r in sorted(letter_rows, key=lambda x: str(x.get("partLabel") or "")):
                    pl = r.get("partLabel")
                    units.append(
                        _unit_from_rows(
                            major,
                            [r],
                            pl,
                            pipeline=pipeline_for_selection(major, pl),
                        )
                    )
                continue
            units.append(_unit_from_rows(major, rows, None))
            continue

        # 第3問など: 数値小問はまとめる
        primary = [r for r in rows if not is_numeric_sub_part(r.get("partLabel"))]
        source = primary if primary else rows
        units.append(_unit_from_rows(major, source, None))

    return sort_generation_units(units)


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
