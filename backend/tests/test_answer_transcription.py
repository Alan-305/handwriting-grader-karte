from app.ai.prompts.answer_transcription import infer_transcription_profile


def test_infer_symbol():
    assert infer_transcription_profile({"type": "symbol", "order": 2}) == "symbol"


def test_infer_japanese_from_format():
    assert (
        infer_transcription_profile(
            {"type": "japanese", "order": 1},
            {"answerFormat": "japanese_grid", "prompt": "次の英文を要約せよ"},
        )
        == "japanese"
    )


def test_infer_english_composition():
    assert (
        infer_transcription_profile(
            {"type": "english", "order": 4},
            {"answerFormat": "english_composition", "prompt": "Write about 80 words"},
        )
        == "english"
    )


def test_infer_japanese_from_wakuyaku_prompt():
    assert (
        infer_transcription_profile(
            {"type": "english", "order": 3},
            {"prompt": "次の英文を和訳しなさい"},
        )
        == "japanese"
    )
