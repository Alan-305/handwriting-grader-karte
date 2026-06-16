from app.services.transcription_service import first_pending_transcription_step


def test_first_pending_transcription_step_all_done():
    targets = [
        {"questionId": "q1", "partIndex": 0},
        {"questionId": "q2", "partIndex": 0},
    ]
    existing = [
        {"questionId": "q1", "partIndex": 0, "studentAnswerText": "a"},
        {"questionId": "q2", "partIndex": 0, "studentAnswerText": "b"},
    ]
    assert first_pending_transcription_step(existing, targets) == 2


def test_first_pending_transcription_step_skips_completed_prefix():
    targets = [
        {"questionId": "q1", "partIndex": 0},
        {"questionId": "q2", "partIndex": 0},
    ]
    existing = [
        {"questionId": "q1", "partIndex": 0, "studentAnswerText": "a"},
    ]
    assert first_pending_transcription_step(existing, targets) == 1


def test_first_pending_transcription_step_empty():
    targets = [{"questionId": "q1", "partIndex": 0}]
    assert first_pending_transcription_step([], targets) == 0
