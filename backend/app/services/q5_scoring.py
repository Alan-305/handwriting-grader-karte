"""第5問・日本語記述の採点ポイント整形。"""

from __future__ import annotations

import re

from app.ai.schemas.q5_generation import (
    Q5ChoiceItem,
    Q5QuestionExplanation,
    Q5QuestionsResult,
    Q5ScoringPoint,
    Q5SubQuestion,
    Q5TeacherPackResult,
)
from app.ai.schemas.q5_generation_claude import (
    Q5QuestionsClaudeResult,
    Q5TeacherPackClaudeResult,
)

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


_CHOICE_LINE_RE = re.compile(r"^([a-fA-F])\s*[.:：]\s*(.+)$", re.DOTALL)


def parse_q5_choice_line(line: str) -> Q5ChoiceItem | None:
    """Claude 簡略スキーマの \"a: 選択肢\" 形式を Q5ChoiceItem に変換。"""
    stripped = line.strip()
    if not stripped:
        return None
    match = _CHOICE_LINE_RE.match(stripped)
    if match:
        return Q5ChoiceItem(label=match.group(1).lower(), text=match.group(2).strip())
    if ":" in stripped:
        label, _, text = stripped.partition(":")
        label = label.strip().lower()
        text = text.strip()
        if len(label) == 1 and label.isalpha() and text:
            return Q5ChoiceItem(label=label, text=text)
    return None


def required_points_to_scoring_points(
    lines: list[str],
    *,
    passage_basis: str = "",
) -> list[Q5ScoringPoint]:
    basis = passage_basis.strip()
    return [
        Q5ScoringPoint(
            pointJa=line.strip(),
            passageBasis=basis,
            pointsHint="必須",
        )
        for line in lines
        if line.strip()
    ]


def questions_from_claude(raw: Q5QuestionsClaudeResult) -> Q5QuestionsResult:
    """Claude 簡略スキーマ → 内部 Q5QuestionsResult に変換。"""
    questions: list[Q5SubQuestion] = []
    for q in raw.questions:
        basis = q.passage_anchor.strip()
        choices: list[Q5ChoiceItem] = []
        for line in q.choices:
            if isinstance(line, dict):
                choices.append(Q5ChoiceItem.model_validate(line))
                continue
            parsed = parse_q5_choice_line(str(line))
            if parsed:
                choices.append(parsed)
        questions.append(
            Q5SubQuestion(
                number=q.number,
                partLabel=q.part_label,
                questionType=q.question_type,
                prompt=q.prompt,
                passageAnchor=q.passage_anchor,
                targetWord=q.target_word,
                underlinedText=q.underlined_text,
                charLimitJa=q.char_limit_ja,
                choices=choices,
                scoringPoints=required_points_to_scoring_points(
                    q.required_points,
                    passage_basis=basis,
                ),
                directionCriterionJa=q.direction_criterion_ja,
            )
        )
    return Q5QuestionsResult(
        instructions=raw.instructions,
        passageForExam=raw.passage_for_exam,
        questions=questions,
    )


def scoring_points_from_dicts(raw: list[dict] | None) -> list[Q5ScoringPoint]:
    if not raw:
        return []
    out: list[Q5ScoringPoint] = []
    for item in raw:
        if isinstance(item, dict) and str(item.get("pointJa") or item.get("point_ja") or "").strip():
            out.append(Q5ScoringPoint.model_validate(item))
    return out


def teacher_pack_from_claude(
    raw: Q5TeacherPackClaudeResult,
    questions: Q5QuestionsResult | None = None,
) -> Q5TeacherPackResult:
    """Claude 簡略スキーマ → 内部 Q5TeacherPackResult に変換。"""
    q_by_num: dict[int, Q5SubQuestion] = {}
    if questions:
        q_by_num = {q.number: q for q in questions.questions}

    explanations: list[Q5QuestionExplanation] = []
    for ex in raw.explanations:
        sub = q_by_num.get(ex.number)
        inherited = list(sub.scoring_points) if sub else []
        points: list[Q5ScoringPoint] = []
        for i, line in enumerate(ex.required_points):
            hint = "必須"
            basis = ""
            if inherited and i < len(inherited):
                hint = inherited[i].points_hint or hint
                basis = inherited[i].passage_basis
            points.append(
                Q5ScoringPoint(
                    pointJa=line.strip(),
                    passageBasis=basis,
                    pointsHint=hint,
                )
            )
        if not points and inherited:
            points = inherited
        direction = ex.direction_criterion_ja.strip()
        if not direction and sub:
            direction = sub.direction_criterion_ja.strip()
        explanations.append(
            Q5QuestionExplanation(
                number=ex.number,
                correctChoice=ex.correct_choice,
                answerText=ex.answer_text,
                explanationJa=ex.explanation_ja,
                scoringPoints=points,
                directionCriterionJa=direction,
            )
        )

    return Q5TeacherPackResult(
        modelAnswerSummary=raw.model_answer_summary,
        explanations=explanations,
        fullTranslationJa="",
        vocabularyList=[],
    )


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
