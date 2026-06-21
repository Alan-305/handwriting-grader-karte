"""第5問・小問ラベル (A)(B)(C) と本文の *下線* 記法。"""

from __future__ import annotations

import re

from app.ai.schemas.q5_generation import (
    Q5_MAX_SUB_QUESTIONS,
    Q5_MIN_SUB_QUESTIONS,
    Q5SubQuestion,
    Q5QuestionsResult,
)
from app.services.question_prompt_markup import normalize_prompt_markup

_EXAM_BLANK = re.compile(r"^\(\d{1,3}\)$")
_LEADING_PART_LABEL = re.compile(r"^\([A-Za-z]\)\s*")

Q5_DEFAULT_INSTRUCTIONS = (
    "次の英文を読み、(A)〜(G)の問いに答えなさい。"
    "なお、下線部のある問はそれぞれ本文中に示された箇所に対応する。"
    "記述解答は日本語で、選択式解答は記号で答えよ。"
)


def q5_instructions_for_count(count: int) -> str:
    if count < 1:
        return Q5_DEFAULT_INSTRUCTIONS
    end = q5_part_label_letter(min(count, 26))
    return (
        f"次の英文を読み、(A)〜({end})の問いに答えなさい。"
        "なお、下線部のある問はそれぞれ本文中に示された箇所に対応する。"
        "記述解答は日本語で、選択式解答は記号で答えよ。"
    )


def q5_display_label(q: Q5SubQuestion) -> str:
    """小問表示ラベル (A)〜(H)。"""
    raw = (q.part_label or "").strip().upper().strip("()")
    if len(raw) == 1 and raw.isalpha():
        return f"({raw})"
    if 1 <= q.number <= 26:
        return f"({chr(64 + q.number)})"
    return f"({q.number})"


def q5_part_label_letter(index: int) -> str:
    """1-based → A, B, C …"""
    if 1 <= index <= 26:
        return chr(64 + index)
    return str(index)


def _normalize_blank_labels(q: Q5SubQuestion, display: str) -> list[str]:
    labels: list[str] = []
    for raw in q.blank_labels:
        token = str(raw).strip()
        if not token:
            continue
        if _EXAM_BLANK.match(token):
            labels.append(display)
        elif token.upper().strip("()") == q5_part_label_letter(q.number):
            labels.append(display)
        else:
            labels.append(token)
    if not labels and q.question_type.lower() == "cloze":
        labels.append(display)
    return labels


def _normalize_prompt_text(prompt: str, display: str) -> str:
    text = (prompt or "").strip()
    text = re.sub(r"空所\s*\(\d{1,3}\)", f"空所{display}", text)
    text = re.sub(r"空所\s*\([A-Za-z]\)", f"空所{display}", text)
    text = re.sub(r"下線部\s*\(\d{1,3}\)", f"下線部{display}", text)
    text = re.sub(r"下線部\s*\([A-Za-z]\)", f"下線部{display}", text)
    text = re.sub(r"問\s*\d+", display, text)
    text = _LEADING_PART_LABEL.sub("", text)
    return text.strip()


def strip_prompt_leading_label(prompt: str) -> str:
    """表示用：行頭の (A) 等を除去（ラベル行と二重にならないように）。"""
    return _LEADING_PART_LABEL.sub("", (prompt or "").strip()).strip()


def q5_question_fingerprint(q: Q5SubQuestion) -> str:
    ul = q.underlined_text.strip().lower()
    tw = q.target_word.strip().lower()
    anchor = q.passage_anchor.strip().lower()
    prompt = strip_prompt_leading_label(q.prompt).lower()
    qtype = q.question_type.lower()
    if ul:
        return f"{qtype}|ul:{ul}"
    if tw:
        return f"{qtype}|tw:{tw}"
    if anchor:
        return f"{qtype}|anchor:{anchor}"
    return f"{qtype}|prompt:{prompt[:120]}"


def dedupe_q5_questions(questions: Q5QuestionsResult) -> tuple[Q5QuestionsResult, int]:
    """同一下線・同一設問の重複を除去。除去件数を返す。"""
    seen: set[str] = set()
    unique: list[Q5SubQuestion] = []
    removed = 0
    for q in sorted(questions.questions, key=lambda x: x.number):
        fp = q5_question_fingerprint(q)
        if fp in seen:
            removed += 1
            continue
        seen.add(fp)
        unique.append(q)
    questions.questions = unique
    return questions, removed


def cap_q5_questions(questions: Q5QuestionsResult) -> Q5QuestionsResult:
    if len(questions.questions) > Q5_MAX_SUB_QUESTIONS:
        questions.questions = questions.questions[:Q5_MAX_SUB_QUESTIONS]
    return questions


def normalize_q5_questions(questions: Q5QuestionsResult) -> Q5QuestionsResult:
    """小問ラベルを (A)〜 に統一し、(21) 等の試験番号を除去する。"""
    ordered = sorted(questions.questions, key=lambda x: x.number)
    for i, q in enumerate(ordered, start=1):
        q.number = i
        q.part_label = q5_part_label_letter(i)
        display = q5_display_label(q)
        q.blank_labels = _normalize_blank_labels(q, display)
        q.prompt = _normalize_prompt_text(q.prompt, display)
    questions.questions = ordered
    count = len(questions.questions)
    if count >= Q5_MIN_SUB_QUESTIONS:
        questions.instructions = q5_instructions_for_count(count)
    return questions


def sanitize_q5_questions(questions: Q5QuestionsResult) -> tuple[Q5QuestionsResult, int]:
    """重複除去 → 上限カット → ラベル正規化 → 冒頭指示の統一。"""
    _, removed = dedupe_q5_questions(questions)
    cap_q5_questions(questions)
    normalize_q5_questions(questions)
    return questions, removed


def _wrap_once(text: str, phrase: str, wrapped: str) -> str:
    if not phrase or phrase not in text or wrapped in text:
        return text
    return text.replace(phrase, wrapped, 1)


def _wrap_word_once(text: str, word: str) -> str:
    if not word.strip():
        return text
    pattern = re.compile(rf"\b({re.escape(word.strip())})\b", re.IGNORECASE)

    def repl(m: re.Match[str]) -> str:
        matched = m.group(1)
        return f"*{matched}*"

    return pattern.sub(repl, text, count=1)


def apply_q5_passage_markup(passage: str, questions: list[Q5SubQuestion]) -> str:
    """本文に *下線* と空所 (A) ___ を反映する（プレビュー用）。"""
    body = (passage or "").strip()
    if not body:
        return body

    for q in sorted(questions, key=lambda x: x.number):
        anchor = q.passage_anchor.strip()
        display = q5_display_label(q)
        qtype = q.question_type.lower()

        if qtype == "cloze":
            if anchor and anchor in body:
                body = _wrap_once(body, anchor, f"{display} ___")
            continue

        underline = q.underlined_text.strip()
        if underline:
            body = _wrap_once(body, underline, f"*{underline}*")
        elif anchor and qtype in {"underlined_explanation", "expression_meaning"}:
            body = _wrap_once(body, anchor, f"*{anchor}*")

        if q.target_word.strip():
            body = _wrap_word_once(body, q.target_word.strip())

    return normalize_prompt_markup(body)
