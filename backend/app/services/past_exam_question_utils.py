"""過去問 AI 解析結果のマージ・テキスト抽出ユーティリティ。"""

from __future__ import annotations

import re
from collections import defaultdict

from app.ai.schemas.past_exam import ParsedPastQuestion

_MAJOR_HEADING = re.compile(
    r"第\s*(?P<num>[0-9０-９]{1,2}|[一二三四五六七八九十]+)\s*問",
)

_KANJI_DIGIT = {
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
    "十": 10,
}


def _major_order_from_token(token: str) -> int | None:
    token = token.strip()
    if not token:
        return None
    if token.isdigit():
        return int(token)
    if len(token) == 1 and token in _KANJI_DIGIT:
        return _KANJI_DIGIT[token]
    if token == "十":
        return 10
    # 十一などは今回の入試大問では稀なため省略
    return None


def extract_major_sections(exam_text: str) -> dict[int, str]:
    """OCR/埋め込みテキストから「第N問」ブロックを抽出する。"""
    matches = list(_MAJOR_HEADING.finditer(exam_text))
    if not matches:
        return {}

    sections: dict[int, str] = {}
    for index, match in enumerate(matches):
        major = _major_order_from_token(match.group("num") or "")
        if major is None:
            continue
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(exam_text)
        body = exam_text[start:end].strip()
        if body:
            sections[major] = body
    return sections


def ensure_majors_from_exam_text(
    questions: list[ParsedPastQuestion],
    exam_text: str,
) -> tuple[list[ParsedPastQuestion], list[str]]:
    """AI が省略した大問を OCR テキストの見出しから復元する。"""
    sections = extract_major_sections(exam_text)
    if not sections:
        return questions, []

    by_major: dict[int, ParsedPastQuestion] = {}
    for q in questions:
        if q.major_order not in by_major or len(q.prompt) > len(by_major[q.major_order].prompt):
            by_major[q.major_order] = q

    recovered_notes: list[str] = []
    out: list[ParsedPastQuestion] = list(questions)

    for major in sorted(sections):
        section_text = sections[major]
        existing = by_major.get(major)
        if existing is None:
            out.append(
                ParsedPastQuestion(
                    major_order=major,
                    type="english",
                    prompt=section_text,
                    notes=(
                        "PDFテキストの見出しから自動復元しました。"
                        "AI構造化では省略されていた可能性があります。内容を確認してください。"
                    ),
                )
            )
            recovered_notes.append(f"第{major}問をOCRテキストから復元しました。")
            continue

        if not existing.prompt.strip() and section_text.strip():
            for i, q in enumerate(out):
                if q.major_order == major and (q.part_label or "") == (existing.part_label or ""):
                    out[i] = q.model_copy(
                        update={
                            "prompt": section_text,
                            "notes": (q.notes + "\nOCRテキストから問題文を補完。").strip(),
                        }
                    )
                    recovered_notes.append(f"第{major}問の問題文をOCRテキストから補完しました。")
                    break
        elif existing.prompt.strip() and len(section_text) > len(existing.prompt) + 200:
            for i, q in enumerate(out):
                if q.major_order == major and (q.part_label or "") == (existing.part_label or ""):
                    out[i] = q.model_copy(
                        update={
                            "prompt": section_text,
                            "notes": (q.notes + "\nOCRテキストの方が長いため問題文を差し替え。").strip(),
                        }
                    )
                    recovered_notes.append(
                        f"第{major}問の問題文をOCRテキストの長い版に差し替えました。"
                    )
                    break

    out.sort(key=lambda q: (q.major_order, str(q.part_label or "")))
    return out, recovered_notes


def dedupe_text_blocks(blocks: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for block in blocks:
        text = block.strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def consolidate_parsed_questions(questions: list[ParsedPastQuestion]) -> list[ParsedPastQuestion]:
    """ページ単位の過剰分割や空エントリを大問単位にまとめる。"""
    if not questions:
        return []

    by_key: dict[tuple[int, str], list[ParsedPastQuestion]] = defaultdict(list)
    for q in questions:
        part = (q.part_label or "").strip()
        by_key[(q.major_order, part)].append(q)

    merged: list[ParsedPastQuestion] = []
    for (major, part), items in sorted(by_key.items()):
        prompts = dedupe_text_blocks([i.prompt for i in items if i.prompt.strip()])
        answers = dedupe_text_blocks([i.model_answer for i in items if i.model_answer.strip()])
        if not prompts and not answers:
            continue
        first = items[0]
        merged.append(
            first.model_copy(
                update={
                    "prompt": "\n\n".join(prompts),
                    "model_answer": "\n\n".join(answers),
                }
            )
        )

    if len(merged) <= 15:
        return merged

    by_major: dict[int, list[ParsedPastQuestion]] = defaultdict(list)
    for q in merged:
        by_major[q.major_order].append(q)

    collapsed: list[ParsedPastQuestion] = []
    for major, items in sorted(by_major.items()):
        prompts = dedupe_text_blocks([i.prompt for i in items if i.prompt.strip()])
        answers = dedupe_text_blocks([i.model_answer for i in items if i.model_answer.strip()])
        if not prompts and not answers:
            continue
        first = items[0]
        labels = [i.part_label for i in items if i.part_label]
        part_label = labels[0] if len(labels) == 1 else None
        collapsed.append(
            first.model_copy(
                update={
                    "part_label": part_label,
                    "prompt": "\n\n".join(prompts),
                    "model_answer": "\n\n".join(answers),
                }
            )
        )
    return collapsed
