from app.ai.schemas.q4a_generation import (
    Q4AItem,
    Q4AProblemResult,
    Q4AExplanationItem,
    Q4ATeacherPackResult,
    Q4AUnderlinedPart,
)
from app.services.question_q4a_service import (
    Q4A_DEFAULT_INSTRUCTIONS,
    QuestionQ4AService,
    assemble_q4a_model_answer,
    assemble_q4a_prompt,
    normalize_q4a_problem_layout,
)

_LONG_PARTS = [
    "has been growing rapidly in recent years across",
    "are deployed in many sensitive domains today",
    "policymakers struggle to balance innovation carefully",
    "public trust and ethical accountability concerns",
    "researchers continue to develop new technologies rapidly",
]


def _sample_problem() -> Q4AProblemResult:
    parts = [
        Q4AUnderlinedPart(label=l, text=_LONG_PARTS[i])
        for i, l in enumerate(["a", "b", "c", "d", "e"])
    ]
    english = (
        "The debate (a) *has been growing rapidly in recent years across* society as "
        "systems (b) *are deployed in many sensitive domains today* where "
        "(c) *policymakers struggle to balance innovation carefully* against "
        "(d) *public trust and ethical accountability concerns* while "
        "(e) *researchers continue to develop new technologies rapidly*."
    )
    return Q4AProblemResult(
        instructions=Q4A_DEFAULT_INSTRUCTIONS,
        items=[
            Q4AItem(
                number=i,
                itemLabel=f"({i})",
                instructionJa="",
                englishBlock=english,
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
    assert Q4A_DEFAULT_INSTRUCTIONS in text
    assert "(1) The debate" in text
    assert "(5)" in text
    assert "(21)" not in text
    assert "←誤り" not in text
    assert "(a) *has been growing rapidly in recent years across*" in text
    assert "不適切なものを1つ選べ" not in text.replace(Q4A_DEFAULT_INSTRUCTIONS, "")


def test_normalize_q4a_problem_layout_clears_per_paragraph_instructions():
    problem = _sample_problem()
    problem.items[0].instruction_ja = "次の英文の下線部のうち…"
    problem.items[2].instruction_ja = "繰り返し指示"
    normalized = normalize_q4a_problem_layout(problem)
    assert normalized.instructions == Q4A_DEFAULT_INSTRUCTIONS
    assert all(item.instruction_ja == "" for item in normalized.items)


def test_ensure_markup_wraps_bare_phrases_and_adds_labels():
    from app.services.q4a_prompt_markup import ensure_q4a_english_block_markup

    phrase_a = "are deployed in many sensitive domains today"
    phrase_b = "The debate over artificial intelligence ethics"
    item = Q4AItem(
        number=1,
        englishBlock="The debate over artificial intelligence ethics are deployed in many sensitive domains today.",
        parts=[
            Q4AUnderlinedPart(label="a", text=phrase_a),
            Q4AUnderlinedPart(label="b", text=phrase_b),
            Q4AUnderlinedPart(label="c", text="policymakers struggle to balance innovation carefully"),
            Q4AUnderlinedPart(label="d", text="public trust and ethical accountability concerns"),
            Q4AUnderlinedPart(label="e", text="researchers continue to develop new technologies rapidly"),
        ],
        errorLabel="a",
    )
    block = ensure_q4a_english_block_markup(item)
    assert f"(a) *{phrase_a}*" in block
    assert f"(b) *{phrase_b}*" in block


def test_assemble_q4a_model_answer():
    pack = Q4ATeacherPackResult(
        modelAnswerSummary="(1) c, (2) c",
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
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("HGK_ANTHROPIC_API_KEY", "")

    svc = QuestionQ4AService()
    monkeypatch.setattr(svc.university_ctx, "_load_past_questions_for_years", lambda *a, **k: [])

    result = svc.run_pipeline(
        teacher_id="teacher-test",
        topic_hint="AI ethics",
        difficulty="standard",
    )
    assert result["majorOrder"] == 4
    assert result["partLabel"] == "(A)"
    assert result["generationPipeline"] == "q4a"
    assert result["typeLabel"] == "第4問(A)"
    assert "【解答・解説】" in result["modelAnswer"]
    assert len(result["generationArtifacts"]["items"]) == 5
    assert "(1)" in result["prompt"]
    assert "(a) *has been growing rapidly in recent years across*" in result["prompt"]
