from app.services.grading_modes import is_english_composition


def test_composition_by_answer_format():
    assert is_english_composition({"answerFormat": "english_composition", "prompt": ""})


def test_composition_by_prompt():
    assert is_english_composition({"prompt": "次のテーマで80語程度の英作文を書きなさい"})


def test_not_composition_short_answer():
    assert not is_english_composition({"type": "english", "prompt": "次の空欄を埋めよ"})
