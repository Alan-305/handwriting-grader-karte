from app.services.grading_modes import is_english_composition


def test_composition_by_answer_format():
    assert is_english_composition({"answerFormat": "english_composition", "prompt": ""})


def test_composition_by_prompt():
    assert is_english_composition({"prompt": "次のテーマで80語程度の英作文を書きなさい"})


def test_not_composition_short_answer():
    assert not is_english_composition({"type": "english", "prompt": "次の空欄を埋めよ"})


def test_symbol_short_answer_by_type():
    from app.services.grading_modes import is_symbol_short_answer

    assert is_symbol_short_answer({"type": "symbol"})
    assert is_symbol_short_answer({"type": "english", "answerFormat": "short"})
    assert is_symbol_short_answer({"type": "english", "answerFormat": "symbol"})
    assert not is_symbol_short_answer({"type": "english", "answerFormat": "underline"})


def test_comprehensive_reading_part():
    from app.services.grading_modes import is_comprehensive_reading_part

    assert is_comprehensive_reading_part({"partCount": 3})
    assert not is_comprehensive_reading_part({"partCount": 1, "answerFormat": "short"})
