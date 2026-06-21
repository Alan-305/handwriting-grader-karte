from unittest.mock import MagicMock

import pytest
from pydantic import BaseModel

from app.ai.generation_structured_client import (
    GEMINI_GENERATION_FALLBACK_MODEL,
    GenerationStructuredClient,
    _is_output_truncation,
    _should_fallback_to_gemini,
)
from app.ai.schemas.q5_generation import Q5QuestionsResult, Q5SubQuestion
from app.generation_limits import GEMINI_MAX_OUTPUT_COMPREHENSIVE
from app.services.question_q5_service import _normalize_questions_result


class _TinySchema(BaseModel):
    value: str


def test_normalize_questions_result_strips_duplicate_passage():
    long_passage = "word " * 200
    questions = Q5QuestionsResult(
        passageForExam=long_passage.strip(),
        questions=[
            Q5SubQuestion(number=1, questionType="cloze", prompt="test", passageAnchor="anchor"),
        ],
    )
    _normalize_questions_result(questions, long_passage)
    assert questions.passage_for_exam == ""


def test_generation_client_prefers_anthropic(monkeypatch):
    client = GenerationStructuredClient()
    expected = _TinySchema(value="from-anthropic")

    anthropic_mock = MagicMock(return_value=expected)
    gemini_mock = MagicMock()

    monkeypatch.setattr(client._anthropic, "client", MagicMock())
    monkeypatch.setattr(client._anthropic, "complete_structured", anthropic_mock)
    monkeypatch.setattr(client._gemini, "complete_structured", gemini_mock)

    result = client.complete_structured(
        system="sys",
        user_text="user",
        response_schema=_TinySchema,
    )

    assert result == expected
    anthropic_mock.assert_called_once()
    assert anthropic_mock.call_args.kwargs["for_generation"] is True
    gemini_mock.assert_not_called()


def test_generation_client_falls_back_to_gemini_on_json_error(monkeypatch):
    client = GenerationStructuredClient()
    expected = _TinySchema(value="from-gemini")

    anthropic_mock = MagicMock(
        side_effect=ValueError("AI 応答の JSON が不正です: Unterminated string")
    )
    gemini_mock = MagicMock(return_value=expected)

    monkeypatch.setattr(client._anthropic, "client", MagicMock())
    monkeypatch.setattr(client._gemini, "model", MagicMock())
    monkeypatch.setattr(client._anthropic, "complete_structured", anthropic_mock)
    monkeypatch.setattr(client._gemini, "complete_structured", gemini_mock)

    result = client.complete_structured(
        system="sys",
        user_text="user",
        response_schema=_TinySchema,
    )

    assert result == expected
    gemini_mock.assert_called_once()


def test_generation_client_retries_anthropic_on_truncation(monkeypatch):
    client = GenerationStructuredClient()
    expected = _TinySchema(value="from-anthropic-retry")

    anthropic_mock = MagicMock(
        side_effect=[
            ValueError("AI 応答が max_tokens で切れました。再試行してください。"),
            expected,
        ]
    )
    gemini_mock = MagicMock()

    monkeypatch.setattr(client._anthropic, "client", MagicMock())
    monkeypatch.setattr(client._gemini, "model", MagicMock())
    monkeypatch.setattr(client._anthropic, "complete_structured", anthropic_mock)
    monkeypatch.setattr(client._gemini, "complete_structured", gemini_mock)

    result = client.complete_structured(
        system="sys",
        user_text="user",
        response_schema=_TinySchema,
        max_output_tokens=16384,
    )

    assert result == expected
    assert anthropic_mock.call_count == 2
    assert anthropic_mock.call_args_list[1].kwargs["max_output_tokens"] == (
        GEMINI_MAX_OUTPUT_COMPREHENSIVE
    )
    gemini_mock.assert_not_called()


def test_generation_client_does_not_fallback_on_truncation(monkeypatch):
    client = GenerationStructuredClient()

    anthropic_mock = MagicMock(
        side_effect=ValueError("AI 応答が max_tokens で切れました。再試行してください。")
    )
    gemini_mock = MagicMock()

    monkeypatch.setattr(client._anthropic, "client", MagicMock())
    monkeypatch.setattr(client._gemini, "model", MagicMock())
    monkeypatch.setattr(client._anthropic, "complete_structured", anthropic_mock)
    monkeypatch.setattr(client._gemini, "complete_structured", gemini_mock)

    with pytest.raises(ValueError, match="max_tokens"):
        client.complete_structured(
            system="sys",
            user_text="user",
            response_schema=_TinySchema,
        max_output_tokens=GEMINI_MAX_OUTPUT_COMPREHENSIVE,
    )

    assert anthropic_mock.call_count == 1
    gemini_mock.assert_not_called()


def test_generation_client_uses_flash_when_only_gemini(monkeypatch):
    client = GenerationStructuredClient()
    expected = _TinySchema(value="from-gemini")
    gemini_mock = MagicMock(return_value=expected)

    monkeypatch.setattr(client._anthropic, "client", None)
    monkeypatch.setattr(client._gemini, "model", MagicMock())
    monkeypatch.setattr(client._gemini, "complete_structured", gemini_mock)

    result = client.complete_structured(
        system="sys",
        user_text="user",
        response_schema=_TinySchema,
    )

    assert result == expected
    assert gemini_mock.call_args.kwargs["model_name"] == "gemini-2.5-flash"


def test_should_not_fallback_to_gemini_on_schema_complexity():
    exc = ValueError("Schema is too complex.")
    assert _should_fallback_to_gemini(exc) is False


def test_is_output_truncation_detects_max_tokens():
    assert _is_output_truncation(ValueError("max_tokens limit")) is True
    assert _is_output_truncation(ValueError("Gemini の応答が長さ制限で切れました")) is True


def test_generation_client_raises_when_anthropic_fails_without_gemini(monkeypatch):
    client = GenerationStructuredClient()

    monkeypatch.setattr(client._anthropic, "client", MagicMock())
    monkeypatch.setattr(client._gemini, "model", None)
    monkeypatch.setattr(
        client._anthropic,
        "complete_structured",
        MagicMock(side_effect=ValueError("AI 応答の JSON が不正です: Unterminated string")),
    )

    with pytest.raises(ValueError, match="JSON"):
        client.complete_structured(
            system="sys",
            user_text="user",
            response_schema=_TinySchema,
        )
