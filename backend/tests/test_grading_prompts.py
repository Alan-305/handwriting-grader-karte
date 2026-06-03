from app.ai.prompts.grading_english import GRADING_SYSTEM, build_grading_user_prompt


def test_grading_system_contains_grade_levels():
    assert "優" in GRADING_SYSTEM
    assert "良" in GRADING_SYSTEM
    assert "別解" in GRADING_SYSTEM
    assert "不可" in GRADING_SYSTEM
    assert "不合格" not in GRADING_SYSTEM.split("禁止")[0] or "禁止" in GRADING_SYSTEM


def test_grading_system_feedback_explanation_style():
    assert "feedback" in GRADING_SYSTEM
    assert "①" in GRADING_SYSTEM
    assert "生徒の" in GRADING_SYSTEM and "使わない" in GRADING_SYSTEM


def test_build_prompt_includes_model_answer():
    prompt = build_grading_user_prompt(
        question_type="english",
        prompt="Write about your town.",
        model_answer="My town is small.",
        max_points=10,
        rubric=None,
    )
    assert "My town is small." in prompt
    assert "10" in prompt


def test_build_prompt_includes_student_name():
    prompt = build_grading_user_prompt(
        question_type="english",
        prompt="Write about your town.",
        model_answer="My town is small.",
        max_points=10,
        rubric=None,
        student_name="山田太郎",
    )
    assert "山田太郎" in prompt
    assert "あなたの" in prompt
    assert "山田太郎さん" not in prompt
