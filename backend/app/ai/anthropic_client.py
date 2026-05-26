import json
import logging
import os

from anthropic import Anthropic
from flask import current_app
from pydantic import BaseModel

from app.ai.retry import parse_json_response, with_retry

logger = logging.getLogger(__name__)

DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"

_DEPRECATED_ANTHROPIC_MODELS = {
    "claude-sonnet-4-20250514",
    "claude-sonnet-4-0",
    "claude-opus-4-20250514",
    "claude-opus-4-0",
}

_ANTHROPIC_FALLBACK_CHAIN = [
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-3-5-sonnet-20241022",
]


def normalize_anthropic_model(raw: str | None) -> str:
    if not raw or not str(raw).strip():
        return DEFAULT_ANTHROPIC_MODEL

    name = str(raw).strip()
    if name in _DEPRECATED_ANTHROPIC_MODELS:
        logger.warning(
            "Anthropic model %r is deprecated/unavailable; using %s instead.",
            raw,
            DEFAULT_ANTHROPIC_MODEL,
        )
        return DEFAULT_ANTHROPIC_MODEL
    return name


def _resolve_anthropic_api_key() -> str:
    try:
        return current_app.config["ANTHROPIC_API_KEY"]
    except RuntimeError:
        return os.getenv("HGK_ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_API_KEY", "")


def _resolve_anthropic_model() -> str:
    try:
        return normalize_anthropic_model(current_app.config["ANTHROPIC_MODEL"])
    except RuntimeError:
        return normalize_anthropic_model(os.getenv("ANTHROPIC_MODEL"))


class AnthropicVisionClient:
    def __init__(self, api_key: str | None = None, model: str | None = None):
        if api_key is not None:
            self.api_key = api_key
        else:
            self.api_key = _resolve_anthropic_api_key()

        if model is not None:
            self.model = normalize_anthropic_model(model)
        else:
            self.model = _resolve_anthropic_model()

        self.client = Anthropic(api_key=self.api_key) if self.api_key else None

    def _fallback_models(self) -> list[str]:
        chain = [self.model, *[m for m in _ANTHROPIC_FALLBACK_CHAIN if m != self.model]]
        seen: set[str] = set()
        ordered: list[str] = []
        for name in chain:
            if name not in seen:
                seen.add(name)
                ordered.append(name)
        return ordered

    def _extract_response_text(self, response) -> str:
        parts: list[str] = []
        for block in response.content:
            if getattr(block, "type", None) == "text" and getattr(block, "text", None):
                parts.append(block.text)
        return "\n".join(parts).strip()

    def _create_message(self, *, system: str, content: list[dict], model: str):
        return self.client.messages.create(
            model=model,
            max_tokens=4096,
            system=system + "\n\nRespond with valid JSON only. No markdown, no preamble.",
            messages=[{"role": "user", "content": content}],
        )

    def complete_structured(
        self,
        *,
        system: str,
        user_text: str,
        response_schema: type[BaseModel],
        image_base64: str | None = None,
        media_type: str = "image/jpeg",
    ) -> BaseModel:
        if not self.client:
            return self._mock_response(response_schema)

        content: list[dict] = []
        if image_base64:
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_base64,
                    },
                }
            )
        content.append({"type": "text", "text": user_text})

        last_error: Exception | None = None
        for model_name in self._fallback_models():
            try:
                def call(model=model_name):
                    response = self._create_message(system=system, content=content, model=model)
                    text = self._extract_response_text(response)
                    if not text:
                        stop = getattr(response, "stop_reason", None)
                        raise ValueError(f"AI が空の応答を返しました (stop_reason={stop})")
                    logger.debug("Anthropic raw response (first 300 chars): %r", text[:300])
                    return parse_json_response(text, response_schema)

                result = with_retry(call, max_retries=4)
                self.model = model_name
                return result
            except Exception as exc:
                last_error = exc
                message = str(exc).lower()
                retryable = (
                    "404" in message
                    or "not_found" in message
                    or "json" in message
                    or "空の応答" in str(exc)
                    or isinstance(exc, (json.JSONDecodeError, ValueError))
                )
                if retryable:
                    logger.warning(
                        "Anthropic model %s failed (%s); trying fallback",
                        model_name,
                        exc,
                    )
                    continue
                raise

        raise RuntimeError(
            f"Anthropic 添削モデルが利用できません（試行: {', '.join(self._fallback_models())}）。"
            f" .env の ANTHROPIC_MODEL を確認してください。"
        ) from last_error

    def _mock_response(self, schema: type[BaseModel]) -> BaseModel:
        mock = {
            "grade": "良",
            "score": 7,
            "maxPoints": 10,
            "studentAnswerText": "（開発モード: APIキー未設定）",
            "feedback": "基本的な内容は押さえています。細部の表現を確認しましょう。",
            "explanation": "模範解答と比べ、時制と語彙の精度を高めるとさらに良くなります。",
            "errorTags": ["スペルミス"],
            "teacherNotes": "時制の確認を重点的に。",
        }
        return schema.model_validate(mock)
