"""Q2B Claude 簡略スキーマ → 内部 Q2BGenerationResult 変換。"""

from __future__ import annotations

from app.ai.schemas.q2b_generation import (
    Q2BBadLiteralTranslation,
    Q2BGenerationResult,
    Q2BSampleAnswer,
    Q2BSegmentExplanation,
)
from app.ai.schemas.q2b_generation_claude import Q2BProblemClaudeResult, Q2BTeacherPackClaudeResult


def _split_pipe(line: str, *, min_parts: int = 1) -> list[str]:
    parts = [p.strip() for p in (line or "").split("|")]
    if len(parts) < min_parts:
        return parts + [""] * (min_parts - len(parts))
    return parts


def parse_sample_answer_line(line: str, *, index: int = 0) -> Q2BSampleAnswer | None:
    text = (line or "").strip()
    if not text:
        return None
    if ":" in text and "|" not in text:
        approach, rest = text.split(":", 1)
        english = rest.strip()
        label = "解答例1（構文・熟語を活かした標準的な訳）" if index == 0 else "解答例2（より平易な単語でパラフレーズした柔軟な訳）"
        return Q2BSampleAnswer(
            labelJa=label,
            english=english,
            approach=approach.strip().lower() or ("standard" if index == 0 else "paraphrase"),
        )
    parts = _split_pipe(text, min_parts=3)
    approach = parts[0].lower() or ("standard" if index == 0 else "paraphrase")
    label = parts[1] or (
        "解答例1（構文・熟語を活かした標準的な訳）"
        if approach == "standard"
        else "解答例2（より平易な単語でパラフレーズした柔軟な訳）"
    )
    english = parts[2]
    if not english:
        return None
    return Q2BSampleAnswer(labelJa=label, english=english, approach=approach)


def parse_segment_line(line: str) -> Q2BSegmentExplanation | None:
    parts = _split_pipe(line, min_parts=3)
    if not parts[0]:
        return None
    return Q2BSegmentExplanation(
        segmentJa=parts[0],
        literalTrapJa=parts[1],
        englishThinkingJa=parts[2],
    )


def parse_bad_literal_line(line: str) -> Q2BBadLiteralTranslation | None:
    parts = _split_pipe(line, min_parts=2)
    if not parts[0]:
        return None
    return Q2BBadLiteralTranslation(
        ngEnglish=parts[0],
        whyWrongJa=parts[1],
        suggestedRephraseJa=parts[2] if len(parts) > 2 else "",
    )


def problem_from_claude(raw: Q2BProblemClaudeResult) -> Q2BGenerationResult:
    answers: list[Q2BSampleAnswer] = []
    for i, line in enumerate(raw.sample_answers):
        parsed = parse_sample_answer_line(line, index=i)
        if parsed:
            answers.append(parsed)
    return Q2BGenerationResult(
        theme=raw.theme.strip(),
        genre=raw.genre.strip(),
        instructionJa=raw.instruction_ja.strip(),
        japanesePassage=raw.japanese_passage.strip(),
        underlinedSegmentsJa=list(raw.underlined_segments_ja),
        sampleAnswers=answers,
        sourceNote=raw.source_note.strip(),
    )


def merge_teacher_pack(
    base: Q2BGenerationResult,
    raw: Q2BTeacherPackClaudeResult,
) -> Q2BGenerationResult:
    segments: list[Q2BSegmentExplanation] = []
    for line in raw.segment_explanations:
        parsed = parse_segment_line(line)
        if parsed:
            segments.append(parsed)

    bad_literals: list[Q2BBadLiteralTranslation] = []
    for line in raw.bad_literal_translations:
        parsed = parse_bad_literal_line(line)
        if parsed:
            bad_literals.append(parsed)

    return Q2BGenerationResult(
        theme=base.theme,
        genre=base.genre,
        instructionJa=base.instruction_ja,
        japanesePassage=base.japanese_passage,
        underlinedSegmentsJa=base.underlined_segments_ja,
        sampleAnswers=base.sample_answers,
        sourceNote=base.source_note,
        wakuyakuProcessJa=raw.wakuyaku_process_ja.strip(),
        grammarEssentialsJa=list(raw.grammar_essentials_ja),
        segmentExplanations=segments,
        badLiteralTranslations=bad_literals,
        commonMistakesJa=list(raw.common_mistakes_ja),
    )
