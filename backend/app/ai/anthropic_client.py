import json
import logging

from anthropic import Anthropic
from flask import current_app
from pydantic import BaseModel

from app.ai.retry import parse_json_response, with_retry

logger = logging.getLogger(__name__)


class AnthropicVisionClient:
    def __init__(self, api_key: str | None = None, model: str | None = None):
        if api_key is not None:
            self.api_key = api_key
        else:
            try:
                self.api_key = current_app.config["ANTHROPIC_API_KEY"]
            except RuntimeError:
                self.api_key = ""

        if model is not None:
            self.model = model
        else:
            try:
                self.model = current_app.config["ANTHROPIC_MODEL"]
            except RuntimeError:
                self.model = "claude-sonnet-4-20250514"

        self.client = Anthropic(api_key=self.api_key) if self.api_key else None

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

        def call():
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2048,
                system=system + "\n\nRespond with valid JSON only.",
                messages=[{"role": "user", "content": content}],
            )
            text = response.content[0].text
            logger.info("Anthropic grading completed")
            return parse_json_response(text, response_schema)

        return with_retry(call)

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
