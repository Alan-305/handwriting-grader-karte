import json
import logging
import re
import time
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def with_retry(func, max_retries: int = 3, base_delay: float = 1.0):
    last_error = None
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as exc:
            last_error = exc
            status = getattr(exc, "status_code", None)
            if status and status not in (429, 500, 502, 503, 504):
                raise
            if attempt < max_retries - 1:
                delay = base_delay * (2**attempt)
                logger.warning("AI retry %s/%s after %ss", attempt + 1, max_retries, delay)
                time.sleep(delay)
    raise last_error


def extract_json_payload(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        raise ValueError("AI が空の応答を返しました")

    fence = re.search(r"```(?:json)?\s*\n?(.*?)```", cleaned, re.DOTALL | re.IGNORECASE)
    if fence:
        cleaned = fence.group(1).strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end > start:
        cleaned = cleaned[start : end + 1]

    if not cleaned.startswith("{"):
        raise ValueError(f"JSON が見つかりません: {text[:200]!r}")

    return cleaned


def parse_json_response(text: str, schema: type[T]) -> T:
    payload = extract_json_payload(text)
    try:
        data: dict[str, Any] = json.loads(payload)
    except json.JSONDecodeError as exc:
        logger.warning("JSON parse failed: %s | raw=%r", exc, text[:500])
        raise ValueError(f"AI 応答の JSON が不正です: {exc}") from exc

    try:
        return schema.model_validate(data)
    except ValidationError as exc:
        logger.warning("Schema validation failed: %s | data=%r", exc, data)
        raise ValueError(f"AI 応答の形式が不正です: {exc}") from exc
