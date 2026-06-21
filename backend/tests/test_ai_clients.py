from app.ai.anthropic_client import AnthropicVisionClient
from app.ai.schemas.grading import GradeResult
from app.ai.schemas.q5_generation import Q5PassageResult


def test_mock_grade_response():
    client = AnthropicVisionClient(api_key="", model="test")
    result = client._mock_response(GradeResult)
    assert result.grade in ("優", "良", "不可")
    assert result.score >= 0


def test_mock_q5_generation_response():
    client = AnthropicVisionClient(api_key="", model="test")
    result = client._mock_response(Q5PassageResult)
    assert result.passage
    assert "Ken" in result.passage or "volunteer" in result.passage.lower()
