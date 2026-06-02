from app.ai.schemas.q4a_generation import (
    Q4AItem,
    Q4AProblemResult,
    Q4AExplanationItem,
    Q4ATeacherPackResult,
    Q4AUnderlinedPart,
)
from app.services.question_q4a_service import (
    QuestionQ4AService,
    assemble_q4a_model_answer,
    assemble_q4a_prompt,
)


def _sample_problem() -> Q4AProblemResult:
    parts = [
        Q4AUnderlinedPart(label=l, text=f"word_{l}")
        for l in ["a", "b", "c", "d", "e"]
    ]
    return Q4AProblemResult(
        instructions="次の各英文について、下線部のうち不適切なものを1つ選べ。",
        items=[
            Q4AItem(
                number=i,
                itemLabel=f"({20 + i})",
                instructionJa="不適切なものを1つ選べ。",
                englishBlock=(
                    f"Sample *word_a* for item {i} with *word_b* and *word_c* "
                    f"*word_d* and *word_e*."
                ),
                parts=parts,
                errorLabel="c",
                errorCategory="syntax",
            )
            for i in range(1, 6)
        ],
    )


def test_assemble_q4a_prompt_has_five_items_and_asterisk_markup():
    problem = _sample_problem()
    text = assemble_q4a_prompt(problem=problem)
    assert "(21)" in text
    assert "(25)" in text
    assert "←誤り" not in text
    assert "*word_a*" in text


def test_ensure_markup_wraps_bare_phrases():
    from app.services.q4a_prompt_markup import ensure_q4a_english_block_markup

    item = Q4AItem(
        number=1,
        englishBlock="The system are deployed quickly.",
        parts=[
            Q4AUnderlinedPart(label="a", text="are deployed"),
            Q4AUnderlinedPart(label="b", text="The system"),
            Q4AUnderlinedPart(label="c", text="quickly"),
            Q4AUnderlinedPart(label="d", text="system"),
            Q4AUnderlinedPart(label="e", text="deployed"),
        ],
        errorLabel="a",
    )
    block = ensure_q4a_english_block_markup(item)
    assert "*are deployed*" in block


def test_assemble_q4a_model_answer():
    pack = Q4ATeacherPackResult(
        modelAnswerSummary="(21) c, (22) c",
        explanations=[
            Q4AExplanationItem(
                number=1,
                errorLabel="c",
                errorCategory="syntax",
                explanationJa="主語と動詞が一致しない。",
                correctionEn="is",
            ),
        ],
    )
    text = assemble_q4a_model_answer(pack)
    assert "【解答・解説】" in text
    assert "修正例" in text


def test_run_pipeline_mock_without_api_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("HGK_GEMINI_API_KEY", "")

    svc = QuestionQ4AService()
    monkeypatch.setattr(svc.university_ctx, "_load_past_questions_for_years", lambda *a, **k: [])

    result = svc.run_pipeline(topic_hint="AI ethics", difficulty="standard")
    assert result["majorOrder"] == 4
    assert result["partLabel"] == "(A)"
    assert result["generationPipeline"] == "q4a"
    assert result["typeLabel"] == "第4問(A)"
    assert "【解答・解説】" in result["modelAnswer"]
    assert len(result["generationArtifacts"]["items"]) == 5
