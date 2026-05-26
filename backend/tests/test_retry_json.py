import pytest

from app.ai.retry import extract_json_payload, parse_json_response
from app.ai.schemas.grading import GradeResult


def test_extract_json_from_fence():
    text = '```json\n{"grade": "良", "score": 8, "maxPoints": 10, "feedback": "ok", "explanation": "x"}\n```'
    payload = extract_json_payload(text)
    assert payload.startswith("{")


def test_extract_json_embedded():
    text = (
        'Here is the result:\n'
        '{"grade": "優", "score": 9, "maxPoints": 10, "feedback": "a", '
        '"explanation": "b", "studentAnswerText": "", "errorTags": [], "teacherNotes": ""}'
    )
    data = parse_json_response(text, GradeResult)
    assert data.grade == "優"


def test_extract_json_empty_raises():
    with pytest.raises(ValueError, match="空"):
        extract_json_payload("")
