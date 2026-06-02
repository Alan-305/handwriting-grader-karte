"""大問ラベル・型キー（循環 import 回避のため独立モジュール）。"""


def format_type_label(major_order: int, part_label: str | None = None) -> str:
    base = f"第{major_order}問"
    label = (part_label or "").strip()
    if label and label != "本文":
        return f"{base}{label}"
    return base


def type_key(major_order: int, part_label: str | None = None) -> str:
    return f"{major_order}:{(part_label or '').strip()}"
