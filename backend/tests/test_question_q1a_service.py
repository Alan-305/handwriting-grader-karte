from app.ai.schemas.q1a_generation import Q1AGenerationResult, Q1AScoringPoint
from app.services.question_q1a_service import (
    QuestionQ1AService,
    assemble_q1a_model_answer,
    assemble_q1a_prompt,
    ja_char_count,
)


def test_ja_char_count():
    assert ja_char_count("あいう。えお") == 6


def test_assemble_q1a_prompt():
    result = Q1AGenerationResult(
        instruction_ja="以下の英文の内容を、70～80字の日本語で要約せよ。（句読点も字数に含める）",
        opening_constraint="「本質的には」から書き始めること",
        passage="First paragraph.\n\nSecond paragraph.",
    )
    text = assemble_q1a_prompt(result=result)
    assert "70～80字" in text
    assert "本質的には" in text
    assert "First paragraph" in text


def test_assemble_q1a_model_answer_includes_sections():
    summary = "あ" * 75
    result = Q1AGenerationResult(
        model_answer_ja=summary,
        scoring_points=[Q1AScoringPoint(point_ja="主張", points_hint="8点")],
        summarization_process_ja="具体例を省略した。",
        common_mistakes_ja=["盛り込みすぎ"],
    )
    text = assemble_q1a_model_answer(result=result)
    assert "■ 解答例" in text
    assert "■ 採点のポイント" in text
    assert "■ 解説" in text
    assert "75字" in text


def test_structural_issues_flags_char_count():
    result = Q1AGenerationResult(
        passage="word " * 350,
        instruction_ja="70字で要約",
        model_answer_ja="短い",
        scoring_points=[Q1AScoringPoint(point_ja="a"), Q1AScoringPoint(point_ja="b")],
    )
    issues = QuestionQ1AService._structural_issues(result)
    assert any("70〜80字" in i for i in issues)
