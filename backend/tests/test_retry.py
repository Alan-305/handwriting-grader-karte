import pytest

from app.ai.retry import _is_retryable_ai_error, with_retry


def test_is_retryable_ai_error_json_value_error():
    assert _is_retryable_ai_error(ValueError("AI 応答の JSON が不正です"))


def test_is_retryable_ai_error_non_retryable():
    assert not _is_retryable_ai_error(ValueError("permission denied"))


def test_with_retry_json_errors():
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 2:
            raise ValueError("AI 応答の JSON が不正です")
        return "ok"

    assert with_retry(flaky, max_retries=3) == "ok"
    assert calls["n"] == 2
