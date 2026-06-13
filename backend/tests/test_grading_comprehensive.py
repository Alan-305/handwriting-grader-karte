from app.ai.prompts.grading_comprehensive import GRADING_SYSTEM_COMPREHENSIVE, build_comprehensive_text_prompt
from app.services.grading_modes import is_comprehensive_reading_part
from app.services.grading_prompt import select_grading_prompts


def test_comprehensive_system_structure():
    assert "総評" in GRADING_SYSTEM_COMPREHENSIVE
    assert "箇条書き" in GRADING_SYSTEM_COMPREHENSIVE
    assert "選択肢" in GRADING_SYSTEM_COMPREHENSIVE
    assert "模範解答の全文は explanation に書かない" in GRADING_SYSTEM_COMPREHENSIVE


def test_is_comprehensive_reading_part():
    assert is_comprehensive_reading_part({"partCount": 3, "type": "english"})
    assert is_comprehensive_reading_part({"questionAnswerFormat": "composite", "partCount": 1})
    assert not is_comprehensive_reading_part({"partCount": 1, "answerFormat": "short", "type": "symbol"})
    assert not is_comprehensive_reading_part(
        {"partCount": 2, "answerFormat": "english_composition", "type": "english"}
    )


def test_select_comprehensive_before_symbol():
    target = {
        "partCount": 4,
        "type": "english",
        "answerFormat": "short",
        "gradingMode": "standard",
    }
    system, _ = select_grading_prompts(target)
    assert system == GRADING_SYSTEM_COMPREHENSIVE


def test_build_comprehensive_text_prompt():
    text = build_comprehensive_text_prompt(
        prompt="長文と設問",
        model_answer="問1 正答は b",
        max_points=5,
        student_answer_text="a",
        rubric=None,
        part_label="(2)",
        student_name=None,
    )
    assert "採点対象の小問: (2)" in text
    assert "箇条書き" in text
    assert "模範解答全文は explanation に書かない" in text
