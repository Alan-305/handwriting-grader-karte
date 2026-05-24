from app.ai.anthropic_client import AnthropicVisionClient
from app.ai.schemas.grading import GradeResult


def test_mock_grade_response():
    client = AnthropicVisionClient(api_key="", model="test")
    result = client._mock_response(GradeResult)
    assert result.grade in ("優", "良", "不可")
    assert result.score >= 0
