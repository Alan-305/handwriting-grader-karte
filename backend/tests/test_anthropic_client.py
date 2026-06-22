from unittest.mock import MagicMock

from app.ai.anthropic_client import (
    _format_grading_failure,
    _is_auth_error,
    _is_model_unavailable_error,
    normalize_anthropic_model,
)


def test_normalize_anthropic_model_defaults():
    assert normalize_anthropic_model(None) == "claude-sonnet-4-6"
    assert normalize_anthropic_model("") == "claude-sonnet-4-6"


def test_normalize_anthropic_model_migrates_deprecated():
    assert normalize_anthropic_model("claude-sonnet-4-20250514") == "claude-sonnet-4-6"
    assert normalize_anthropic_model("claude-3-5-sonnet-20241022") == "claude-sonnet-4-6"


class _FakeAPIError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


def test_is_model_unavailable_error():
    assert _is_model_unavailable_error(_FakeAPIError(404, "model not found"))
    assert not _is_model_unavailable_error(ValueError("AI 応答の JSON が不正です"))


def test_is_auth_error():
    assert _is_auth_error(_FakeAPIError(401, "authentication_error"))


def test_format_grading_failure_json_hint():
    msg = _format_grading_failure(ValueError("AI 応答の JSON が不正です"), ["claude-sonnet-4-6"])
    assert "JSON" in msg or "切れ" in msg


def test_format_grading_failure_auth():
    msg = _format_grading_failure(_FakeAPIError(401, "invalid x-api-key"), ["claude-sonnet-4-6"])
    assert "API キー" in msg


def test_format_grading_failure_streaming_required():
    msg = _format_grading_failure(
        ValueError(
            "Streaming is required for operations that may take longer than 10 minutes."
        ),
        ["claude-sonnet-4-6"],
        for_generation=True,
    )
    assert "問題生成AI" in msg
    assert "ストリーミング" in msg


def test_invoke_structured_parse_uses_streaming(monkeypatch):
    from app.ai.anthropic_client import AnthropicVisionClient
    from app.ai.schemas.grading import GradeResult

    parsed = GradeResult.model_validate(
        {
            "grade": "良",
            "score": 8,
            "maxPoints": 10,
            "studentAnswerText": "test",
            "feedback": "ok",
            "explanation": "ok",
        }
    )

    class _FakeStream:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get_final_message(self):
            msg = type("Msg", (), {})()
            msg.content = []
            msg.stop_reason = "end_turn"
            msg.parsed_output = parsed
            return msg

    stream_mock = MagicMock(return_value=_FakeStream())
    client = AnthropicVisionClient(api_key="test-key", model="claude-sonnet-4-6")
    client.client = MagicMock()
    client.client.messages.stream = stream_mock

    result = client._invoke_structured_parse(
        system="sys",
        content=[{"type": "text", "text": "hello"}],
        model="claude-sonnet-4-6",
        max_tokens=65536,
        response_schema=GradeResult,
    )
    assert result.grade == "良"
    stream_mock.assert_called_once()
