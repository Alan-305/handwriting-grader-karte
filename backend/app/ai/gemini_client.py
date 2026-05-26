import json
import logging
import os

import google.generativeai as genai
from flask import current_app
from pydantic import BaseModel

from app.ai.retry import parse_json_response, with_retry

logger = logging.getLogger(__name__)


def _resolve_gemini_api_key() -> str:
    try:
        return current_app.config["GEMINI_API_KEY"]
    except RuntimeError:
        return os.getenv("HGK_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY", "")


DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

# 2025以降、新規利用者には 2.0 系が提供されないため自動で最新安定版へ寄せる
_DEPRECATED_GEMINI_MODELS = {
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-pro",
}


def normalize_gemini_model(raw: str | None) -> str:
    """models/ 接頭辞や廃止モデル名を正規化する。"""
    if not raw or not str(raw).strip():
        return DEFAULT_GEMINI_MODEL

    name = str(raw).strip()
    if name.startswith("models/"):
        name = name[len("models/") :]

    if name in _DEPRECATED_GEMINI_MODELS or name.startswith("gemini-2.0-"):
        logger.warning(
            "Gemini model %r is deprecated/unavailable; using %s instead.",
            raw,
            DEFAULT_GEMINI_MODEL,
        )
        return DEFAULT_GEMINI_MODEL

    return name


def _resolve_gemini_model() -> str:
    try:
        return normalize_gemini_model(current_app.config["GEMINI_MODEL"])
    except RuntimeError:
        return normalize_gemini_model(os.getenv("GEMINI_MODEL"))


class GeminiAnalysisClient:
    def __init__(self, api_key: str | None = None, model: str | None = None):
        if api_key is not None:
            self.api_key = api_key
        else:
            self.api_key = _resolve_gemini_api_key()

        if model is not None:
            self.model_name = model
        else:
            self.model_name = _resolve_gemini_model()

        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel(self.model_name)
            logger.info("Gemini client initialized with model=%s", self.model_name)
        else:
            self.model = None

    def _generate_content(self, parts):
        try:
            return self.model.generate_content(parts)
        except Exception as exc:
            message = str(exc).lower()
            if (
                self.model_name != DEFAULT_GEMINI_MODEL
                and ("404" in message or "no longer available" in message or "not found" in message)
            ):
                logger.warning(
                    "Gemini model %s failed (%s); retrying with %s",
                    self.model_name,
                    exc,
                    DEFAULT_GEMINI_MODEL,
                )
                self.model_name = DEFAULT_GEMINI_MODEL
                self.model = genai.GenerativeModel(self.model_name)
                return self.model.generate_content(parts)
            raise

    def complete_structured(
        self,
        *,
        system: str,
        user_text: str,
        response_schema: type[BaseModel],
        image_base64: str | None = None,
        media_type: str = "image/jpeg",
    ) -> BaseModel:
        if not self.model:
            return self._mock_response(response_schema)

        prompt = f"{system}\n\n{user_text}\n\nRespond with valid JSON only."

        def call():
            response = self._generate_content(prompt)
            text = response.text or "{}"
            logger.info("Gemini analysis completed")
            return parse_json_response(text, response_schema)

        return with_retry(call)

    def transcribe_images(
        self,
        *,
        system: str,
        user_text: str,
        images_jpeg: list[bytes],
    ) -> str:
        if not self.model:
            raise RuntimeError(
                "GEMINI_API_KEY が未設定です。.env に HGK_GEMINI_API_KEY または GEMINI_API_KEY を設定してください。"
            )

        prompt = f"{system}\n\n{user_text}"

        def call():
            parts: list = [prompt]
            for img in images_jpeg:
                parts.append({"mime_type": "image/jpeg", "data": img})
            response = self._generate_content(parts)
            return (response.text or "").strip()

        return with_retry(call)

    def _mock_response(self, schema: type[BaseModel]) -> BaseModel:
        if schema.__name__ == "KarteAdviceResponse":
            mock = {
                "weaknessSummary": "時制の取り違えとスペルミスが繰り返し見られます。",
                "errorFrequency": {"時制ミス": 3, "スペルミス": 5},
                "adviceCards": [
                    {
                        "title": "時制の定着",
                        "body": "過去形・現在完了の使い分けドリルを週3回実施しましょう。",
                        "category": "grammar",
                        "priority": "high",
                    }
                ],
                "readinessComment": "志望校合格には英作文の安定化が最優先課題です。",
            }
            return schema.model_validate(mock)

        raise RuntimeError(
            "GEMINI_API_KEY が未設定です。.env に HGK_GEMINI_API_KEY または GEMINI_API_KEY を設定してください。"
        )
