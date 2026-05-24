import json
import logging

import google.generativeai as genai
from flask import current_app
from pydantic import BaseModel

from app.ai.retry import parse_json_response, with_retry

logger = logging.getLogger(__name__)


class GeminiAnalysisClient:
    def __init__(self, api_key: str | None = None, model: str | None = None):
        if api_key is not None:
            self.api_key = api_key
        else:
            try:
                self.api_key = current_app.config["GEMINI_API_KEY"]
            except RuntimeError:
                self.api_key = ""

        if model is not None:
            self.model_name = model
        else:
            try:
                self.model_name = current_app.config["GEMINI_MODEL"]
            except RuntimeError:
                self.model_name = "gemini-2.0-flash"

        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel(self.model_name)
        else:
            self.model = None

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
            response = self.model.generate_content(prompt)
            text = response.text or "{}"
            logger.info("Gemini analysis completed")
            return parse_json_response(text, response_schema)

        return with_retry(call)

    def _mock_response(self, schema: type[BaseModel]) -> BaseModel:
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
