"""第5問・日本語記述の採点ポイント整形。"""

from __future__ import annotations

import re

from app.ai.schemas.q5_generation import Q5QuestionsResult, Q5ScoringPoint, Q5SubQuestion

Q5_JA_EXPLANATION_TYPES = frozenset({
    "content_explanation",
    "reason_explanation",
    "underlined_explanation",
    "short_answer_ja",
})

Q5_MCQ_PARAPHRASE_TYPES = frozenset({
    "word_usage_match",
    "expression_meaning",
    "english_match",
    "content_match",
})

_WORD_TOKEN = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?|[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+")


def format_q5_scoring_points_lines(
    scoring_points: list[Q5ScoringPoint],
    *,
    direction_criterion: str = "",
) -> list[str]:
    lines: list[str] = []
    if scoring_points:
        lines.append("【採点ポイント（必須要素）】")
        for sp in scoring_points:
            basis = f"（根拠: {sp.passage_basis.strip()}）" if sp.passage_basis.strip() else ""
            hint = f" — {sp.points_hint.strip()}" if sp.points_hint.strip() else ""
            lines.append(f"・{sp.point_ja.strip()}{basis}{hint}")
    if direction_criterion.strip():
        lines.append(f"【方向性の判定】{direction_criterion.strip()}")
    return lines


def format_q5_part_rubric(
    scoring_points: list[dict] | list[Q5ScoringPoint],
    *,
    direction_criterion: str = "",
    char_limit: int | None = None,
) -> str:
    """添削 AI に渡す追加評価基準（answerParts.rubric）。"""
    if isinstance(scoring_points, list) and scoring_points and isinstance(scoring_points[0], dict):
        points = [Q5ScoringPoint.model_validate(p) for p in scoring_points]
    else:
        points = list(scoring_points)  # type: ignore[arg-type]

    parts: list[str] = [
        "日本語記述の採点方針: 模範解答との文言一致は不要。"
        "必須ポイントを押さえ、解答全体が正解の方向性で書かれていれば可。",
    ]
    if char_limit:
        parts.append(f"字数上限: {char_limit}字（超過は軽微な減点対象）。")
    if points:
        parts.append("必須採点ポイント:")
        for i, sp in enumerate(points, start=1):
            basis = f" 根拠={sp.passage_basis.strip()}" if sp.passage_basis.strip() else ""
            parts.append(f"{i}. {sp.point_ja.strip()}{basis}")
    if direction_criterion.strip():
        parts.append(f"方向性: {direction_criterion.strip()}")
    parts.append(
        "不可とする例: 必須ポイントの過半が欠ける、本文と矛盾する、"
        "問いの核心（理由・内容）が逆方向。"
    )
    return " ".join(parts)


def scoring_points_from_dicts(raw: list[dict] | None) -> list[Q5ScoringPoint]:
    if not raw:
        return []
    out: list[Q5ScoringPoint] = []
    for item in raw:
        if isinstance(item, dict) and str(item.get("pointJa") or item.get("point_ja") or "").strip():
            out.append(Q5ScoringPoint.model_validate(item))
    return out


def _content_tokens(text: str) -> list[str]:
    return [w.lower() for w in _WORD_TOKEN.findall(text) if len(w) >= 3]


def choice_passage_overlap_ratio(choice_text: str, passage: str, anchor: str) -> float:
    """選択肢が本文/anchor 語句に依存しすぎていないか（高い=コピー過多）。"""
    tokens = _content_tokens(choice_text)
    if not tokens:
        return 0.0
    pool = set(_content_tokens(f"{passage} {anchor}"))
    if not pool:
        return 0.0
    return len(set(tokens) & pool) / len(tokens)


def has_long_verbatim_phrase(choice_text: str, passage: str) -> bool:
    """本文から5語以上連続で取られたような長句が選択肢に含まれるか。"""
    passage_lower = passage.lower()
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", choice_text)
    for i in range(len(words) - 4):
        phrase = " ".join(words[i : i + 5]).lower()
        if phrase in passage_lower:
            return True
    return False


def choice_design_issues(questions: Q5QuestionsResult, passage: str) -> list[str]:
    """選択式：言い換え不足・本文コピー過多を検出。"""
    issues: list[str] = []
    body = passage or ""

    for q in questions.questions:
        qtype = q.question_type.lower()
        if qtype not in Q5_MCQ_PARAPHRASE_TYPES:
            continue
        texts = [c.text.strip() for c in q.choices if c.text.strip()]
        if len(texts) < 4:
            continue

        high_overlap = sum(
            1
            for t in texts
            if choice_passage_overlap_ratio(t, body, q.passage_anchor) >= 0.72
        )
        verbatim_phrases = sum(1 for t in texts if has_long_verbatim_phrase(t, body))

        if high_overlap >= max(3, len(texts) - 1):
            issues.append(
                f"問{q.number}: 選択肢が本文語句のコピーに近く、言い換え・内容理解が不足"
            )
        if verbatim_phrases >= 2:
            issues.append(
                f"問{q.number}: 選択肢に本文からの長い連続引用が多い（パラフレーズ不足）"
            )

    return issues
