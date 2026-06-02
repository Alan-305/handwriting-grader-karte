from app.ai.schemas.q1b_generation import (
    Q1BBlankAnswer,
    Q1BBlankExplanation,
    Q1BChoice,
    Q1BDummyExplanation,
    Q1BGenerationResult,
)
from app.services.question_q1b_service import (
    QuestionQ1BService,
    assemble_q1b_model_answer,
    assemble_q1b_prompt,
)


def test_assemble_q1b_prompt_includes_blanks_and_choices():
    result = Q1BGenerationResult(
        instructions_ja="次の空所(ア)〜(オ)に入る最も適当なものを選べ。",
        passage="Intro (ア) middle (イ) end.",
        choices=[
            Q1BChoice(label="a", text="Choice A"),
            Q1BChoice(label="b", text="Choice B", is_dummy=False),
        ],
    )
    text = assemble_q1b_prompt(result=result)
    assert "(ア)" in text or "空所" in text
    assert "a)" in text
    assert "Choice A" in text


def test_assemble_q1b_model_answer_sections():
    result = Q1BGenerationResult(
        choices=[
            Q1BChoice(label="a", text="A text"),
            Q1BChoice(label="f", text="Dummy", is_dummy=True),
        ],
        answers=[
            Q1BBlankAnswer(blank_label="ア", correct_choice="a"),
            Q1BBlankAnswer(blank_label="イ", correct_choice="c"),
            Q1BBlankAnswer(blank_label="ウ", correct_choice="b"),
            Q1BBlankAnswer(blank_label="エ", correct_choice="d"),
            Q1BBlankAnswer(blank_label="オ", correct_choice="e"),
        ],
        dummy_choice_label="f",
        overall_summary_ja="全体の論旨。",
        blank_explanations=[
            Q1BBlankExplanation(
                blank_label="ア",
                correct_choice="a",
                rationale_ja="指示語が一致。",
                discourse_note="this → 前文",
            )
        ],
        dummy_explanations=[
            Q1BDummyExplanation(choice_label="f", why_wrong_ja="逆接と矛盾。")
        ],
    )
    text = assemble_q1b_model_answer(result=result)
    assert "■ 解答" in text
    assert "（ア）：a" in text
    assert "ダミー" in text
    assert "全体の論旨" in text


def test_structural_issues_detects_missing_blank():
    result = Q1BGenerationResult(
        passage="No blank labels here " * 100,
        choices=[Q1BChoice(label=c, text="x") for c in "abcdef"],
        answers=[],
        dummy_choice_label="f",
    )
    for c in result.choices:
        if c.label == "f":
            c.is_dummy = True
    issues = QuestionQ1BService._structural_issues(result)
    assert any("(ア)" in i for i in issues)
