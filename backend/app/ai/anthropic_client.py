import logging
import os

from anthropic import Anthropic
from flask import current_app
from pydantic import BaseModel, ValidationError

from app.ai.retry import parse_json_response, with_retry

logger = logging.getLogger(__name__)

DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"

GRADING_MAX_OUTPUT_TOKENS = 16384
COMPOSITION_MAX_OUTPUT_TOKENS = 16384

_DEPRECATED_ANTHROPIC_MODELS = {
    "claude-sonnet-4-20250514",
    "claude-sonnet-4-0",
    "claude-opus-4-20250514",
    "claude-opus-4-0",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-latest",
}

_ANTHROPIC_FALLBACK_CHAIN = [
    "claude-sonnet-4-6",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-5",
    "claude-haiku-4-5-20251001",
]

_GRADING_SYSTEM_SUFFIX = (
    "\n\n出力は指定スキーマの JSON のみ。"
    " 講評・解説は各2〜3文または丸数字5項目以内で簡潔に。"
)


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


def _max_tokens_for_schema(schema: type[BaseModel]) -> int:
    from app.ai.schemas.grading import EnglishCompositionGradeResult

    if schema is EnglishCompositionGradeResult:
        return COMPOSITION_MAX_OUTPUT_TOKENS
    return GRADING_MAX_OUTPUT_TOKENS


def _status_code(exc: Exception) -> int | None:
    code = getattr(exc, "status_code", None)
    if isinstance(code, int):
        return code
    response = getattr(exc, "response", None)
    if response is not None:
        return getattr(response, "status_code", None)
    return None


def _is_auth_error(exc: Exception) -> bool:
    code = _status_code(exc)
    if code in (401, 403):
        return True
    message = str(exc).lower()
    return "authentication" in message or "invalid x-api-key" in message or "api key" in message


def _is_model_unavailable_error(exc: Exception) -> bool:
    code = _status_code(exc)
    if code == 404:
        return True
    message = str(exc).lower()
    return (
        "not_found" in message
        and ("model" in message or "404" in message)
    ) or "model_not_found" in message


def _is_structured_output_unsupported(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "structured" in message
        or "output_format" in message
        or "json_schema" in message
        or "output_config" in message
    )


def _format_grading_failure(last_error: Exception | None, models_tried: list[str]) -> str:
    detail = str(last_error).strip() if last_error else "不明"
    models = ", ".join(models_tried)

    if last_error and _is_auth_error(last_error):
        return (
            "Anthropic API キーが無効です。本番は Secret Manager の HGK_ANTHROPIC_API_KEY、"
            f"ローカルは .env の HGK_ANTHROPIC_API_KEY を確認してください。（{detail[:120]}）"
        )

    lowered = detail.lower()
    if "json" in lowered or "空の応答" in detail or "max_tokens" in lowered:
        return (
            f"添削AIの応答が途中で切れたか、JSON形式になりませんでした（{detail[:160]}）。"
            " しばらく待って再試行してください。繰り返す場合は API の混雑や応答上限の可能性があります。"
        )

    if last_error and _is_model_unavailable_error(last_error):
        return (
            f"指定の添削モデルが API で利用できません（試行: {models}）。"
            " .env / Cloud Run の ANTHROPIC_MODEL を claude-sonnet-4-6 に設定し、"
            " API キーが Sonnet 4.6 を使えるプランか確認してください。"
        )

    return (
        f"添削AIの呼び出しに失敗しました（試行: {models}）。"
        f" 詳細: {detail[:200]}"
    )


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
        text = "\n".join(parts).strip()
        stop = getattr(response, "stop_reason", None)
        if stop == "max_tokens" and text:
            logger.warning(
                "Anthropic response truncated (stop_reason=max_tokens, len=%s)",
                len(text),
            )
        return text

    def _check_stop_reason(self, response) -> None:
        if getattr(response, "stop_reason", None) == "max_tokens":
            raise ValueError(
                "AI 応答が max_tokens で切れました。再試行するか管理者に連絡してください。"
            )

    def _invoke_structured_parse(
        self,
        *,
        system: str,
        content: list[dict],
        model: str,
        max_tokens: int,
        response_schema: type[BaseModel],
    ) -> BaseModel:
        response = self.client.messages.parse(
            model=model,
            max_tokens=max_tokens,
            system=system + _GRADING_SYSTEM_SUFFIX,
            messages=[{"role": "user", "content": content}],
            output_format=response_schema,
        )
        self._check_stop_reason(response)
        parsed = getattr(response, "parsed_output", None)
        if parsed is not None:
            return parsed

        text = self._extract_response_text(response)
        if not text:
            stop = getattr(response, "stop_reason", None)
            raise ValueError(f"AI が空の応答を返しました (stop_reason={stop})")
        logger.warning("parsed_output was None; falling back to text JSON parse")
        return parse_json_response(text, response_schema)

    def _invoke_legacy_create(
        self,
        *,
        system: str,
        content: list[dict],
        model: str,
        max_tokens: int,
        response_schema: type[BaseModel],
    ) -> BaseModel:
        response = self.client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system + _GRADING_SYSTEM_SUFFIX,
            messages=[{"role": "user", "content": content}],
        )
        text = self._extract_response_text(response)
        if not text:
            stop = getattr(response, "stop_reason", None)
            raise ValueError(f"AI が空の応答を返しました (stop_reason={stop})")
        self._check_stop_reason(response)
        return parse_json_response(text, response_schema)

    def _grade_once(
        self,
        *,
        system: str,
        content: list[dict],
        model: str,
        max_tokens: int,
        response_schema: type[BaseModel],
    ) -> BaseModel:
        try:
            return self._invoke_structured_parse(
                system=system,
                content=content,
                model=model,
                max_tokens=max_tokens,
                response_schema=response_schema,
            )
        except Exception as exc:
            if _is_structured_output_unsupported(exc):
                logger.warning(
                    "Structured output unsupported for model=%s; using legacy create: %s",
                    model,
                    exc,
                )
                return self._invoke_legacy_create(
                    system=system,
                    content=content,
                    model=model,
                    max_tokens=max_tokens,
                    response_schema=response_schema,
                )
            raise

    def complete_structured(
        self,
        *,
        system: str,
        user_text: str,
        response_schema: type[BaseModel],
        image_base64: str | None = None,
        media_type: str = "image/jpeg",
        max_output_tokens: int | None = None,
    ) -> BaseModel:
        if not self.client:
            return self._mock_response(response_schema)

        token_limit = max_output_tokens or _max_tokens_for_schema(response_schema)

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

        models_tried: list[str] = []
        last_error: Exception | None = None
        for model_name in self._fallback_models():
            models_tried.append(model_name)
            try:

                def call(model=model_name):
                    return self._grade_once(
                        system=system,
                        content=content,
                        model=model,
                        max_tokens=token_limit,
                        response_schema=response_schema,
                    )

                result = with_retry(call, max_retries=4)
                self.model = model_name
                return result
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Anthropic grading failed model=%s: %s",
                    model_name,
                    exc,
                    exc_info=logger.isEnabledFor(logging.DEBUG),
                )
                if _is_auth_error(exc):
                    raise RuntimeError(_format_grading_failure(exc, models_tried)) from exc
                if _is_model_unavailable_error(exc):
                    continue
                raise RuntimeError(_format_grading_failure(exc, models_tried)) from exc

        raise RuntimeError(_format_grading_failure(last_error, models_tried)) from last_error

    def _mock_response(self, schema: type[BaseModel]) -> BaseModel:
        from app.ai.schemas.grading import EnglishCompositionGradeResult

        mock: dict = {
            "grade": "良",
            "score": 7,
            "maxPoints": 10,
            "studentAnswerText": "（開発モード: APIキー未設定）",
            "feedback": "基本的な内容は押さえています。細部の表現を確認しましょう。",
            "explanation": "模範解答と比べ、時制と語彙の精度を高めるとさらに良くなります。",
            "errorTags": ["スペリングミス"],
            "teacherNotes": "時制の確認を重点的に。",
        }
        if schema is EnglishCompositionGradeResult:
            mock["contentEvaluation"] = "① 課題への応答はおおむねできています。"
            mock["grammarEvaluation"] = "① 時制に注意するとさらに良くなります。"
            mock["polishedAnswer"] = "This is a sample polished answer for development mode."
            mock["explanation"] = ""
        return schema.model_validate(mock)
