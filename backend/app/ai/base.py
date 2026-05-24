from typing import Protocol

from pydantic import BaseModel


class AIClient(Protocol):
    def complete_structured(
        self,
        *,
        system: str,
        user_text: str,
        response_schema: type[BaseModel],
        image_base64: str | None = None,
        media_type: str = "image/jpeg",
    ) -> BaseModel: ...
