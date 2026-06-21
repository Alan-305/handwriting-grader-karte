from app.ai.schemas.q1b_generation import (
    Q1BBlankAnswer,
    Q1BBlankExplanation,
    Q1BChoice,
    Q1BDummyExplanation,
    Q1BGenerationResult,
    Q1BPartA,
    Q1BPartI,
)
from app.services.question_q1b_service import (
    QuestionQ1BService,
    assemble_q1b_model_answer,
    assemble_q1b_prompt,
)


def _sample_part_a() -> Q1BPartA:
    return Q1BPartA(
        instructions_ja="次の空所(1)〜(5)に入る最も適当なものを選べ。",
        passage="Intro (1) middle (2) more (3) text (4) end (5).",
        choices=[
            Q1BChoice(label="a", text="Choice A"),
            Q1BChoice(label="b", text="Choice B"),
            Q1BChoice(label="f", text="Dummy", is_dummy=True),
        ],
        answers=[
            Q1BBlankAnswer(blank_label="1", correct_choice="a"),
            Q1BBlankAnswer(blank_label="2", correct_choice="c"),
            Q1BBlankAnswer(blank_label="3", correct_choice="b"),
            Q1BBlankAnswer(blank_label="4", correct_choice="d"),
            Q1BBlankAnswer(blank_label="5", correct_choice="e"),
        ],
        dummy_choice_label="f",
    )


def _sample_part_i() -> Q1BPartI:
    return Q1BPartI(
        instructions_ja="空所（イ）に語句を並べ替えて入れよ。",
        passage="The research suggests that (イ) the results remain inconclusive.",
        word_bank=[
            "although",
            "the initial",
            "findings",
            "were",
            "promising",
            "several",
            "later",
            "studies",
        ],
        correct_order=[
            "although",
            "the initial",
            "findings",
            "were",
            "promising",
            "several",
            "later",
            "studies",
        ],
        correct_expression_en="although the initial findings were promising, several later studies",
        explanation_ja="譲歩の although が主節を導く。",
    )


def test_assemble_q1b_prompt_includes_both_subquestions():
    result = Q1BGenerationResult(
        instructions_ja="次の（ア）（イ）に答えよ。",
        part_a=_sample_part_a(),
        part_i=_sample_part_i(),
    )
    text = assemble_q1b_prompt(result=result)
    assert "（ア）" in text
    assert "（イ）" in text
    assert "(1)" in text
    assert "a)" in text
    assert "【並べ替える語句】" in text
    assert "although" in text


def test_assemble_q1b_model_answer_sections():
    result = Q1BGenerationResult(
        part_a=Q1BPartA(
            choices=[
                Q1BChoice(label="a", text="A text"),
                Q1BChoice(label="f", text="Dummy", is_dummy=True),
            ],
            answers=[
                Q1BBlankAnswer(blank_label="1", correct_choice="a"),
                Q1BBlankAnswer(blank_label="2", correct_choice="c"),
                Q1BBlankAnswer(blank_label="3", correct_choice="b"),
                Q1BBlankAnswer(blank_label="4", correct_choice="d"),
                Q1BBlankAnswer(blank_label="5", correct_choice="e"),
            ],
            dummy_choice_label="f",
            blank_explanations=[
                Q1BBlankExplanation(
                    blank_label="1",
                    correct_choice="a",
                    rationale_ja="指示語が一致。",
                    discourse_note="this → 前文",
                )
            ],
            dummy_explanations=[
                Q1BDummyExplanation(choice_label="f", why_wrong_ja="逆接と矛盾。")
            ],
        ),
        part_i=_sample_part_i(),
        overall_summary_ja="全体の論旨。",
    )
    text = assemble_q1b_model_answer(result=result)
    assert "■ 小問（ア） 解答" in text
    assert "(1)：a" in text
    assert "■ 小問（イ） 解答" in text
    assert "although" in text
    assert "ダミー" in text
    assert "全体の論旨" in text


def test_structural_issues_detects_missing_blank_and_duplicate_choices():
    long_passage = ("word " * 520).strip() + " (1) (2) (3) (4) (5)"
    result = Q1BGenerationResult(
        part_a=Q1BPartA(
            passage=long_passage,
            choices=[Q1BChoice(label=c, text="x", is_dummy=(c == "f")) for c in "abcdef"],
            answers=[
                Q1BBlankAnswer(blank_label="1", correct_choice="a"),
                Q1BBlankAnswer(blank_label="2", correct_choice="a"),
                Q1BBlankAnswer(blank_label="3", correct_choice="b"),
                Q1BBlankAnswer(blank_label="4", correct_choice="c"),
                Q1BBlankAnswer(blank_label="5", correct_choice="d"),
            ],
            dummy_choice_label="f",
        ),
        part_i=Q1BPartI(passage="No blank here", word_bank=["a"] * 8),
    )
    issues = QuestionQ1BService._structural_issues(result)
    assert any("同じ選択肢記号" in i for i in issues)
    assert any("(イ)" in i for i in issues)
