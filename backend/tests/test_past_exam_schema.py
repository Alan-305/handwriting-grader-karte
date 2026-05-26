"""過去問 import スキーマの null 耐性テスト。"""

from app.ai.schemas.past_exam import ParsedPastQuestion, PastExamParseResponse


def test_parsed_question_accepts_null_notes():
    q = ParsedPastQuestion.model_validate(
        {
            "majorOrder": 1,
            "type": "english",
            "prompt": "第1問",
            "modelAnswer": None,
            "notes": None,
        }
    )
    assert q.notes == ""
    assert q.model_answer == ""


def test_past_exam_response_accepts_null_fields():
    data = PastExamParseResponse.model_validate(
        {
            "year": 2026,
            "universityName": None,
            "parseNotes": None,
            "questions": [
                {
                    "majorOrder": 1,
                    "type": "english",
                    "prompt": "test",
                    "notes": None,
                }
            ],
        }
    )
    assert data.parse_notes == ""
    assert data.questions[0].notes == ""
