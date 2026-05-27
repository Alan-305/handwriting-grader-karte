"""過去問 AI 解析結果のマージ・テキスト抽出ユーティリティ。"""

from __future__ import annotations

from collections import defaultdict

from app.ai.schemas.past_exam import ParsedPastQuestion


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
