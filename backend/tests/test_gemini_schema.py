import json

from app.ai.gemini_schema import gemini_response_schema
from app.ai.retry import parse_json_response, repair_json_payload
from app.ai.schemas.q4a_generation import Q4AProblemResult
from app.ai.schemas.q5_generation import Q5PassageResult


def test_gemini_response_schema_inlines_defs():
    schema = gemini_response_schema(Q5PassageResult)
    assert "passage" in schema["properties"]
    assert "$defs" not in schema
    assert "$ref" not in json.dumps(schema)


def test_gemini_response_schema_strips_numeric_constraints():
    schema = gemini_response_schema(Q4AProblemResult)
    dumped = json.dumps(schema)
    assert "maximum" not in dumped
    assert "minimum" not in dumped


def test_repair_json_trailing_comma():
    broken = '{"title": "T", "passage": "Hello",}'
    fixed = repair_json_payload(broken)
    data = json.loads(fixed)
    assert data["title"] == "T"


def test_parse_json_response_with_trailing_comma():
    text = '{"title": "T", "passage": "Story text here.", "themeSummary": "要約",}'
    result = parse_json_response(text, Q5PassageResult)
    assert result.title == "T"
