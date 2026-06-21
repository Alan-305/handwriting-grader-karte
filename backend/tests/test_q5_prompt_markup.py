from app.ai.schemas.q5_generation import Q5QuestionsResult, Q5SubQuestion
from app.services.q5_prompt_markup import (
    apply_q5_passage_markup,
    normalize_q5_questions,
    q5_display_label,
    sanitize_q5_questions,
)
from app.services.question_q5_service import assemble_q5_prompt, format_q5_questions_block


def test_q5_display_label_uses_letters():
    q = Q5SubQuestion(number=3, partLabel="C", questionType="cloze", prompt="test")
    assert q5_display_label(q) == "(C)"


def test_normalize_q5_questions_replaces_exam_numbers():
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=1,
                questionType="cloze",
                prompt="空所(21)に入る語を選べ。",
                blankLabels=["(21)"],
                passageAnchor="anchor one",
            ),
            Q5SubQuestion(
                number=2,
                questionType="content_explanation",
                prompt="問2の内容",
                passageAnchor="anchor two",
            ),
        ]
    )
    normalize_q5_questions(questions)
    assert questions.questions[0].part_label == "A"
    assert questions.questions[0].blank_labels == ["(A)"]
    assert "(21)" not in questions.questions[0].prompt
    assert questions.questions[1].part_label == "B"


def test_apply_q5_passage_markup_adds_asterisk_underline():
    passage = "Ken felt ashamed after the failed event."
    questions = [
        Q5SubQuestion(
            number=1,
            partLabel="A",
            questionType="underlined_explanation",
            prompt="test",
            underlinedText="ashamed",
            passageAnchor="Ken felt ashamed",
        )
    ]
    marked = apply_q5_passage_markup(passage, questions)
    assert "*ashamed*" in marked


def test_normalize_q5_prompt_relabels_wrong_part_letter():
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=4,
                partLabel="C",
                questionType="expression_meaning",
                prompt="(C) 本文中の下線部 elsewhere is not a place はどのような意味か。",
                underlinedText="elsewhere is not a place",
                passageAnchor="elsewhere is not a place",
            ),
        ]
    )
    normalize_q5_questions(questions)
    assert questions.questions[0].part_label == "A"
    assert questions.questions[0].prompt.startswith("本文中の下線部")
    assert "(C)" not in questions.questions[0].prompt


def test_dedupe_removes_duplicate_underline_questions():
    dup = Q5SubQuestion(
        number=3,
        partLabel="C",
        questionType="expression_meaning",
        prompt="下線部の意味を選べ。",
        underlinedText="elsewhere is not a place",
        passageAnchor="anchor",
    )
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=1,
                partLabel="A",
                questionType="word_usage_match",
                prompt="語法を選べ。",
                targetWord="accumulation",
                passageAnchor="a1",
            ),
            Q5SubQuestion(
                number=2,
                partLabel="B",
                questionType="reason_explanation",
                prompt="理由を述べよ。",
                passageAnchor="a2",
            ),
            dup,
            dup.model_copy(update={"number": 4, "partLabel": "D"}),
            dup.model_copy(update={"number": 5, "partLabel": "E"}),
        ]
    )
    sanitized, removed = sanitize_q5_questions(questions)
    assert removed == 2
    assert len(sanitized.questions) == 3
    assert sanitized.questions[2].part_label == "C"


def test_format_q5_questions_no_double_label():
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=1,
                partLabel="A",
                questionType="content_match",
                prompt="(A) 内容と一致するものを1つ選べ。",
                passageAnchor="anchor",
                choices=[],
            )
        ]
    )
    normalize_q5_questions(questions)
    block = format_q5_questions_block(questions)
    assert block.count("(A)") == 1
    assert "内容と一致する" in block


def test_format_q5_questions_block_uses_alpha_labels():
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=1,
                partLabel="A",
                questionType="content_match",
                prompt="内容と一致するものを1つ選べ。",
                choices=[],
                passageAnchor="anchor",
            )
        ]
    )
    block = format_q5_questions_block(questions)
    assert "(A)" in block
    assert "問1" not in block


def test_assemble_q5_prompt_includes_markup_passage():
    questions = Q5QuestionsResult(
        instructions="次の英文を読み、答えよ。",
        questions=[
            Q5SubQuestion(
                number=1,
                partLabel="A",
                questionType="underlined_explanation",
                prompt="下線部を説明せよ。",
                underlinedText="ashamed",
                passageAnchor="Ken felt ashamed",
            )
        ],
    )
    normalize_q5_questions(questions)
    prompt = assemble_q5_prompt(
        instructions=questions.instructions,
        passage="Ken felt ashamed after the event.",
        questions=questions,
    )
    assert "*ashamed*" in prompt
    assert "(A)" in prompt
