"""問題生成パイプライン向け structured 出力（Claude 優先、Gemini フォールバック）。"""

from __future__ import annotations

import logging

from pydantic import BaseModel

from app.ai.anthropic_client import AnthropicVisionClient
from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.retry import _is_retryable_ai_error
from app.generation_limits import GEMINI_MAX_OUTPUT_COMPREHENSIVE

logger = logging.getLogger(__name__)

# 問題生成の Gemini フォールバックは flash-lite より JSON 安定性が高い flash を使う
GEMINI_GENERATION_FALLBACK_MODEL = "gemini-2.5-flash"


def _is_output_truncation(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "max_tokens" in msg
        or "max tokens" in msg
        or "長さ制限" in str(exc)
        or "切れ" in str(exc)
    )


def _should_fallback_to_gemini(exc: Exception) -> bool:
    """Claude 失敗時に Gemini へ切り替える条件（出力切れ・スキーマ複雑さは除く）。"""
    if _is_output_truncation(exc):
        return False
    if _is_retryable_ai_error(exc):
        return True
    msg = str(exc).lower()
    return any(
        token in msg
        for token in (
            "json",
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
            token_limit = max_output_tokens
            last_exc: Exception | None = None

            for attempt in range(2):
                try:
                    return self._anthropic.complete_structured(
                        system=system,
                        user_text=user_text,
                        response_schema=response_schema,
                        max_output_tokens=token_limit,
                        for_generation=True,
                    )
                except Exception as exc:
                    last_exc = exc
                    if (
                        attempt == 0
                        and _is_output_truncation(exc)
                        and token_limit < GEMINI_MAX_OUTPUT_COMPREHENSIVE
                    ):
                        token_limit = GEMINI_MAX_OUTPUT_COMPREHENSIVE
                        logger.warning(
                            "Anthropic output truncated at %s tokens; retrying with %s",
                            max_output_tokens,
                            token_limit,
                        )
                        continue

                    if self._gemini.model and _should_fallback_to_gemini(exc):
                        logger.warning(
                            "Anthropic generation failed (%s); falling back to Gemini",
                            exc,
                        )
                        try:
                            return self._gemini.complete_structured(
                                system=system,
                                user_text=user_text,
                                response_schema=response_schema,
                                max_output_tokens=max(
                                    max_output_tokens,
                                    GEMINI_MAX_OUTPUT_COMPREHENSIVE,
                                ),
                                model_name=GEMINI_GENERATION_FALLBACK_MODEL,
                            )
                        except Exception as gemini_exc:
                            raise RuntimeError(
                                "Claude（Sonnet）での生成に失敗したため Gemini に切り替えましたが、"
                                f" Gemini も失敗しました。Claude: {exc} / Gemini: {gemini_exc}"
                            ) from gemini_exc

                    raise

            if last_exc:
                raise last_exc

        return self._gemini.complete_structured(
            system=system,
            user_text=user_text,
            response_schema=response_schema,
            max_output_tokens=max_output_tokens,
            model_name=GEMINI_GENERATION_FALLBACK_MODEL,
        )
