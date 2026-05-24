from app.ai.prompts.grading_no_model import GRADING_SYSTEM_NO_MODEL, build_no_model_prompt
from app.services.grading_mode import resolve_grading_mode
from app.services.grading_prompt import build_user_prompt, select_grading_prompts


def test_resolve_grading_mode_without_model_answer():
    q = {"prompt": "Write 80 words about your town.", "modelAnswer": ""}
    assert resolve_grading_mode(q) == "no_model"


def test_resolve_grading_mode_with_model_answer():
    q = {"prompt": "Translate.", "modelAnswer": "My town is small."}
    assert resolve_grading_mode(q) == "standard"


def test_resolve_grading_mode_whitespace_only_model_answer():
    q = {"prompt": "Write an essay.", "modelAnswer": "   "}
    assert resolve_grading_mode(q) == "no_model"


def test_resolve_grading_mode_part_level_model_answer():
    q = {"prompt": "Answer both.", "modelAnswer": ""}
    part = {"modelAnswer": "to"}
    assert resolve_grading_mode(q, part) == "standard"


def test_resolve_grading_mode_explicit_override():
    q = {"prompt": "Essay", "modelAnswer": "", "gradingMode": "standard"}
    assert resolve_grading_mode(q) == "standard"


def test_select_no_model_prompt():
    target = {"gradingMode": "no_model", "type": "english"}
    system, prompt_fn = select_grading_prompts(target)
    assert system == GRADING_SYSTEM_NO_MODEL
    assert prompt_fn is build_no_model_prompt


def test_build_no_model_prompt():
    target = {
        "gradingMode": "no_model",
        "type": "english",
        "prompt": "Write about your future dream in about 80 words.",
        "modelAnswer": "",
        "points": 20,
        "partLabel": None,
        "rubric": "Content and grammar both matter.",
    }
    _, prompt_fn = select_grading_prompts(target)
    text = build_user_prompt(target, prompt_fn)
    assert "模範解答: なし" in text
    assert "80 words" in text
    assert "Content and grammar" in text
