from app.ai.schemas.q5_generation import (
    Q5ChoiceItem,
    Q5PassageResult,
    Q5QuestionExplanation,
    Q5QuestionsResult,
    Q5ScoringPoint,
    Q5SubQuestion,
    Q5TeacherPackResult,
)
from app.services.question_q5_service import (
    QuestionQ5Service,
    assemble_q5_model_answer,
    assemble_q5_prompt,
    passage_completeness_issues,
    passage_integrity_issues,
)


def test_passage_completeness_issues_detects_truncation():
    truncated = "He filed his piece. It was well received. The editors praised his"
    issues = passage_completeness_issues(truncated)
    assert any("文末" in i for i in issues)
    assert any("語数" in i for i in issues)


def test_passage_completeness_issues_accepts_complete_passage():
    words = "word " * 720
    complete = f"{words.strip()}. He finally understood what the bowl had meant."
    issues = passage_completeness_issues(complete)
    assert issues == []


def test_passage_integrity_issues_detects_missing_reference_word():
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=5,
                questionType="cloze",
                prompt="本文中のstimulusに入る語を選べ。",
                passageAnchor="He walked to the market every morning",
                choices=[Q5ChoiceItem(label="a", text="one")],
            ),
        ]
    )
    passage = "He walked to the market every morning without hurry."
    issues = passage_integrity_issues(questions, passage)
    assert any("stimulus" in i for i in issues)


def test_passage_integrity_issues_accepts_valid_anchor():
    passage = "Marcus kept the bowl on his desk for many days."
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=1,
                questionType="content_explanation",
                prompt="Marcusがbowlを捨てられなかった理由を説明せよ。",
                passageAnchor="Marcus kept the bowl on his desk",
                charLimitJa=80,
                scoringPoints=[
                    Q5ScoringPoint(pointJa="bowlへの愛着"),
                    Q5ScoringPoint(pointJa="Yusufとの思い出"),
                ],
                directionCriterionJa="本文の心理描写に沿えば可",
            ),
        ]
    )
    issues = passage_integrity_issues(questions, passage)
    assert issues == []


def test_assemble_q5_prompt_includes_passage_and_questions():
    passage = Q5PassageResult(
        title="T",
        passage="Story body here.",
        wordCount=10,
        themeSummary="成長",
    )
    questions = Q5QuestionsResult(
        instructions="次の英文を読み、答えよ。",
        passageForExam="",
        questions=[
            Q5SubQuestion(
                number=1,
                partLabel="C",
                questionType="content_match",
                prompt="内容と一致するものを1つ選べ。",
                passageAnchor="unique anchor phrase here",
                choices=[
                    Q5ChoiceItem(label="A", text="Cancelled"),
                    Q5ChoiceItem(label="B", text="Won"),
                    Q5ChoiceItem(label="C", text="Left"),
                    Q5ChoiceItem(label="D", text="Slept"),
                ],
            ),
        ],
    )
    from app.services.q5_prompt_markup import normalize_q5_questions

    normalize_q5_questions(questions)
    prompt = assemble_q5_prompt(
        instructions=questions.instructions,
        passage=passage.passage,
        questions=questions,
    )
    assert "Story body here." in prompt
    assert "(A)" in prompt
    assert "問1" not in prompt
    assert "(21)" not in prompt
    assert "A. Cancelled" in prompt


def test_assemble_q5_model_answer_includes_translation_when_present():
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


def test_assemble_q5_model_answer_omits_translation_when_empty():
    pack = Q5TeacherPackResult(
        modelAnswerSummary="1 A",
        explanations=[
            Q5QuestionExplanation(number=1, correctChoice="A", explanationJa="本文どおり"),
        ],
        fullTranslationJa="",
    )
    text = assemble_q5_model_answer(pack)
    assert "【全訳】" not in text
    assert "本文どおり" in text


def test_structural_issues_count_and_overlap():
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=i,
                questionType="content_match",
                prompt="test",
                passageAnchor=f"segment{i} uniqueword{i} anotherunique{i} thirdunique{i}",
                choices=[Q5ChoiceItem(label="a", text="x")],
            )
            for i in range(1, 7)
        ]
    )
    assert QuestionQ5Service._structural_issues(questions) == []

    overlap = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=1,
                questionType="content_explanation",
                prompt="a",
                passageAnchor="Ken felt ashamed and disappointed deeply",
            ),
            Q5SubQuestion(
                number=2,
                questionType="reason_explanation",
                prompt="b",
                passageAnchor="Ken felt ashamed and disappointed deeply",
            ),
        ]
    )
    issues = QuestionQ5Service._structural_issues(overlap)
    assert any("重複" in i for i in issues)
    assert any("6" in i for i in issues)


def test_clarity_issues_flags_missing_char_limit():
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=1,
                questionType="reason_explanation",
                prompt="筆者が打ちのめされた理由を80字以内で説明せよ。",
                passageAnchor="some anchor text here",
                charLimitJa=80,
                scoringPoints=[
                    Q5ScoringPoint(pointJa="ポイント1"),
                    Q5ScoringPoint(pointJa="ポイント2"),
                ],
                directionCriterionJa="因果が本文に沿っていれば可",
            ),
        ]
    )
    issues = QuestionQ5Service._clarity_issues(questions)
    assert not any("charLimitJa" in i for i in issues)


def test_clarity_issues_requires_scoring_points():
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=1,
                questionType="reason_explanation",
                prompt="筆者が打ちのめされた理由を80字以内で説明せよ。",
                passageAnchor="some anchor text here",
                charLimitJa=80,
            ),
        ]
    )
    issues = QuestionQ5Service._clarity_issues(questions)
    assert any("scoringPoints" in i for i in issues)
    assert any("directionCriterionJa" in i for i in issues)


def test_clarity_issues_flags_duplicate_choices():
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=1,
                questionType="expression_meaning",
                prompt="下線部の意味を選べ。",
                underlinedText="test phrase",
                passageAnchor="anchor",
                choices=[
                    Q5ChoiceItem(label="a", text="Same"),
                    Q5ChoiceItem(label="b", text="same"),
                    Q5ChoiceItem(label="c", text="Other"),
                    Q5ChoiceItem(label="d", text="Another"),
                ],
            ),
        ]
    )
    issues = QuestionQ5Service._clarity_issues(questions)
    assert any("同一文" in i for i in issues)


def test_run_pipeline_mock_without_api_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("HGK_GEMINI_API_KEY", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("HGK_ANTHROPIC_API_KEY", "")

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
