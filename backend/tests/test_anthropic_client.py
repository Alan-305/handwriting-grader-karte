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
