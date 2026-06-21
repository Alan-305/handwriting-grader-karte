"""問題生成パイプライン向け structured 出力（Claude 優先、Gemini フォールバック）。"""

from __future__ import annotations

import logging

from pydantic import BaseModel

from app.ai.anthropic_client import AnthropicVisionClient
from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.retry import _is_retryable_ai_error

logger = logging.getLogger(__name__)

# 問題生成の Gemini フォールバックは flash-lite より JSON 安定性が高い flash を使う
GEMINI_GENERATION_FALLBACK_MODEL = "gemini-2.5-flash"


def _should_fallback_to_gemini(exc: Exception) -> bool:
    if _is_retryable_ai_error(exc):
        return True
    msg = str(exc).lower()
    return any(
        token in msg
        for token in (
            "json",
            "max_tokens",
            "形式が不正",
            "unterminated string",
            "delimiter",
        )
    )


class GenerationStructuredClient:
    """第4問・第5問など structured JSON 生成向け。Claude の native parse を優先する。"""

    def __init__(self) -> None:
        self._anthropic = AnthropicVisionClient()
        self._gemini = GeminiAnalysisClient()

    @property
    def primary_provider(self) -> str:
        if self._anthropic.client:
            return "anthropic"
        if self._gemini.model:
            return "gemini"
        return "mock"

    def complete_structured(
        self,
        *,
        system: str,
        user_text: str,
        response_schema: type[BaseModel],
        max_output_tokens: int = 16384,
    ) -> BaseModel:
        if self._anthropic.client:
            try:
                return self._anthropic.complete_structured(
                    system=system,
                    user_text=user_text,
                    response_schema=response_schema,
                    max_output_tokens=max_output_tokens,
                    for_generation=True,
                )
            except Exception as exc:
                if self._gemini.model and _should_fallback_to_gemini(exc):
                    logger.warning(
                        "Anthropic generation failed (%s); falling back to Gemini",
                        exc,
                    )
                    return self._gemini.complete_structured(
                        system=system,
                        user_text=user_text,
                        response_schema=response_schema,
                        max_output_tokens=max_output_tokens,
                        model_name=GEMINI_GENERATION_FALLBACK_MODEL,
                    )
                raise

        return self._gemini.complete_structured(
            system=system,
            user_text=user_text,
            response_schema=response_schema,
            max_output_tokens=max_output_tokens,
            model_name=GEMINI_GENERATION_FALLBACK_MODEL,
        )
