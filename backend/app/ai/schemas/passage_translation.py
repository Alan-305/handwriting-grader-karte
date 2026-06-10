from pydantic import BaseModel, Field


class PassageTranslationResponse(BaseModel):
    """英語本文の段落ごとの和訳。"""

    paragraphs: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}
