import json
import logging
import time
from typing import Any, TypeVar

from pydantic import BaseModel

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


def parse_json_response(text: str, schema: type[T]) -> T:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1]
        cleaned = cleaned.rsplit("```", 1)[0]
    data: dict[str, Any] = json.loads(cleaned)
    return schema.model_validate(data)
