from app.services.passage_translation_policy import (
    is_ai_passage_translation_recommended,
    is_passage_translation_target,
    question_has_english_passage,
)

_LONG_EN = "Read the following passage.\n\n" + ("word " * 60)


def test_q2b_pipeline_excluded_regardless_of_set_order():
    q = {
        "generationPipeline": "q2b",
        "order": 1,
        "type": "english",
        "prompt": _LONG_EN,
    }
    assert not is_ai_passage_translation_recommended(q)


def test_q5_at_set_order_3_is_recommended():
    q = {
        "generationPipeline": "q5",
        "order": 3,
        "type": "english",
        "prompt": _LONG_EN,
    }
    assert is_passage_translation_target(q)


def test_q4a_at_set_order_1_is_recommended():
    q = {
        "generationPipeline": "q4a",
        "order": 1,
        "type": "english",
        "prompt": _LONG_EN,
    }
    assert is_ai_passage_translation_recommended(q)


def test_summary_style_with_english_passage_at_any_order():
    q = {
        "order": 2,
        "type": "english",
        "prompt": f"次の英文を読み、80字以内の日本語で要約せよ。\n\n{_LONG_EN}",
    }
    assert is_ai_passage_translation_recommended(q)


def test_wabun_eibun_prompt_excluded_without_pipeline():
    q = {
        "order": 4,
        "type": "english",
        "prompt": "以下の日本文の下線部を英訳せよ。\n\n私は*勇気*を出して話しかけた。",
    }
    assert not is_ai_passage_translation_recommended(q)


def test_composition_excluded():
    q = {
        "generationPipeline": "q2a",
        "order": 1,
        "type": "english",
        "prompt": "Write an essay of about 80 words.",
        "answerFormat": "english_composition",
    }
    assert not is_ai_passage_translation_recommended(q)


def test_question_has_english_passage():
    assert question_has_english_passage({"type": "english", "prompt": _LONG_EN})
