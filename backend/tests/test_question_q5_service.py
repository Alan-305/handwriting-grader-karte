from app.ai.schemas.q5_generation import (
    Q5ChoiceItem,
    Q5PassageResult,
    Q5QuestionExplanation,
    Q5QuestionsResult,
    Q5SubQuestion,
    Q5TeacherPackResult,
)
from app.services.question_q5_service import (
    QuestionQ5Service,
    assemble_q5_model_answer,
    assemble_q5_prompt,
)


def test_assemble_q5_prompt_includes_passage_and_questions():
    passage = Q5PassageResult(
        title="T",
        passage="Story body here.",
        wordCount=10,
        themeSummary="成長",
    )
    questions = Q5QuestionsResult(
        instructions="次の英文を読み、答えよ。",
        passageForExam="Exam passage with *ashamed*.",
        questions=[
            Q5SubQuestion(
                number=1,
                partLabel="C",
                questionType="content_match",
                prompt="内容と一致するものを1つ選べ。",
                choices=[
                    Q5ChoiceItem(label="A", text="Cancelled"),
                    Q5ChoiceItem(label="B", text="Won"),
                    Q5ChoiceItem(label="C", text="Left"),
                    Q5ChoiceItem(label="D", text="Slept"),
                ],
            ),
        ],
    )
    prompt = assemble_q5_prompt(
        instructions=questions.instructions,
        passage=passage.passage,
        questions=questions,
    )
    assert "Exam passage with" in prompt
    assert "問1" in prompt
    assert "A. Cancelled" in prompt


def test_assemble_q5_model_answer_includes_translation():
    pack = Q5TeacherPackResult(
        modelAnswerSummary="1 A",
        explanations=[
            Q5QuestionExplanation(number=1, correctChoice="A", explanationJa="本文どおり"),
        ],
        fullTranslationJa="物語の全訳です。",
    )
    text = assemble_q5_model_answer(pack)
    assert "【全訳】" in text
    assert "物語の全訳です。" in text


def test_run_pipeline_mock_without_api_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("HGK_GEMINI_API_KEY", "")

    svc = QuestionQ5Service()
    monkeypatch.setattr(svc.university_ctx, "_load_past_questions_for_years", lambda *a, **k: [])

    result = svc.run_pipeline(
        teacher_id="teacher-test",
        topic_hint="ボランティア",
        difficulty="standard",
    )
    assert result["majorOrder"] == 5
    assert result["generationPipeline"] == "q5"
    assert "Story body" in result["prompt"] or "Ken" in result["prompt"]
    assert result["answerFormat"] == "composite"
    assert result["generationArtifacts"]["evaluatorPassed"] is True
    assert "passageForExam" in result["generationArtifacts"]
