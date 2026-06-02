from app.ai.schemas.q2a_generation import (
    Q2AAnswerExplanation,
    Q2AGenerationResult,
    Q2ASampleAnswer,
)
from app.services.question_q2a_service import (
    QuestionQ2AService,
    assemble_q2a_model_answer,
    assemble_q2a_prompt,
    english_word_count,
)


def test_assemble_q2a_prompt():
    result = Q2AGenerationResult(
        question_prompt="Write your answer in 60 to 80 words in English about strength.",
    )
    assert "60" in assemble_q2a_prompt(result=result)


def test_assemble_q2a_model_answer_sections():
    result = Q2AGenerationResult(
        question_prompt="Answer in 60-80 words.",
        sample_answers=[
            Q2ASampleAnswer(stance_label_ja="賛成", english="I agree because " + "word " * 65, word_count=66),
            Q2ASampleAnswer(stance_label_ja="反対", english="I disagree since " + "word " * 62, word_count=63),
        ],
        translations_ja=["和訳1", "和訳2"],
        answer_explanations=[
            Q2AAnswerExplanation(
                answer_index=1,
                logical_structure_ja="主張→理由→結び",
                strengths_ja="具体例がある",
            ),
            Q2AAnswerExplanation(
                answer_index=2,
                logical_structure_ja="対比→結論",
                strengths_ja="接続詞が適切",
            ),
        ],
        useful_expressions=["Furthermore — 追加理由"],
        deduction_points_ja=["論理の飛躍"],
        common_mistakes_ja=["語数オーバー"],
    )
    text = assemble_q2a_model_answer(result=result)
    assert "■ 解答例" in text
    assert "【解答例1】" in text
    assert "■ 和訳" in text
    assert "■ 採点・解答のポイント" in text


def test_structural_issues_word_count():
    short = "Too short."
    result = Q2AGenerationResult(
        question_prompt="Answer in 60 to 80 words in English.",
        sample_answers=[
            Q2ASampleAnswer(stance_label_ja="A", english=short, word_count=3),
            Q2ASampleAnswer(stance_label_ja="B", english=short, word_count=3),
        ],
        translations_ja=["a", "b"],
        answer_explanations=[
            Q2AAnswerExplanation(answer_index=1, logical_structure_ja="x", strengths_ja="y"),
            Q2AAnswerExplanation(answer_index=2, logical_structure_ja="x", strengths_ja="y"),
        ],
        useful_expressions=["expr"],
        deduction_points_ja=["pt"],
    )
    issues = QuestionQ2AService._structural_issues(result)
    assert any("60〜80語" in i for i in issues)
    assert english_word_count(short) < 60
