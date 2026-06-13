from app.ai.prompts.grading_english_composition import COMPOSITION_SYSTEM, build_composition_text_prompt
from app.services.grading_prompt import select_grading_prompts


def test_composition_system_structure():
    assert "総評" in COMPOSITION_SYSTEM
    assert "内容について" in COMPOSITION_SYSTEM
    assert "文法・語法・表現について" in COMPOSITION_SYSTEM
    assert "誤り→正しい表現" in COMPOSITION_SYSTEM
    assert "①" not in COMPOSITION_SYSTEM


def test_select_composition_prompt():
    target = {"answerFormat": "english_composition", "type": "english", "prompt": "80語の英作文"}
    system, _ = select_grading_prompts(target)
    assert system == COMPOSITION_SYSTEM


def test_build_composition_text_prompt_includes_section_hints():
    text = build_composition_text_prompt(
        prompt="Write about your town in about 80 words.",
        model_answer="My town is small.",
        max_points=20,
        student_answer_text="I live in a small town.",
        rubric=None,
        target_words=80,
    )
    assert "feedback は総評のみ" in text
    assert "内容について" in text
    assert "文法・語法・表現について" in text
    assert "完成版英文" in text
