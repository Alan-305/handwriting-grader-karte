from app.ai.prompts.grading_symbol import GRADING_SYSTEM_SYMBOL, build_symbol_text_prompt
from app.services.grading_prompt import build_text_user_prompt, select_grading_prompts


def test_symbol_system_uses_correct_incorrect_explanation_format():
    assert "正解：" in GRADING_SYSTEM_SYMBOL
    assert "不正解：" in GRADING_SYSTEM_SYMBOL
    assert "①" not in GRADING_SYSTEM_SYMBOL
    assert "模範解答欄は使わず" in GRADING_SYSTEM_SYMBOL


def test_select_symbol_prompt_for_short_answer_format():
    target = {
        "type": "english",
        "answerFormat": "short",
        "gradingMode": "standard",
        "partCount": 1,
    }
    system, prompt_fn = select_grading_prompts(target)
    assert system == GRADING_SYSTEM_SYMBOL
    assert prompt_fn.__name__ == "build_symbol_prompt"


def test_build_symbol_text_prompt_includes_part_label_and_format_hint():
    text = build_symbol_text_prompt(
        prompt="次の記述の正誤を答えよ",
        model_answer="(4) 正解: a",
        max_points=5,
        student_answer_text="b",
        rubric=None,
        part_label="(4)",
        student_name=None,
    )
    assert "採点対象の小問: (4)" in text
    assert "(1) 正解" in text
    assert "b" in text


def test_build_text_user_prompt_routes_short_answer_to_symbol():
    text = build_text_user_prompt(
        {
            "type": "english",
            "answerFormat": "short",
            "partCount": 1,
            "prompt": "記号を選べ",
            "modelAnswer": "a",
            "points": 3,
            "partLabel": "(2)",
        },
        "c",
    )
    assert "問題タイプ: symbol" in text
    assert "採点対象の小問: (2)" in text
