"""Claude structured output 用の簡略スキーマ（ネスト・description を抑えて Schema is too complex を回避）。"""

from pydantic import BaseModel, Field, field_validator


class Q5ExplanationClaude(BaseModel):
    number: int
    correct_choice: str = Field(default="", alias="correctChoice")
    answer_text: str = Field(default="", alias="answerText")
    explanation_ja: str = Field(alias="explanationJa")
    direction_criterion_ja: str = Field(default="", alias="directionCriterionJa")
    """必須採点ポイント（日本語・2〜4個。passageBasis は不要）"""
    required_points: list[str] = Field(default_factory=list, alias="requiredPoints")

    model_config = {"populate_by_name": True}

    @field_validator("required_points", mode="before")
    @classmethod
    def coerce_points(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(v).strip() for v in value if str(v).strip()]
        return []


class Q5TeacherPackClaudeResult(BaseModel):
    """解答・解説・語彙のみ（本文全訳は PassageTranslationService で後から生成）。"""

    model_answer_summary: str = Field(alias="modelAnswerSummary")
    explanations: list[Q5ExplanationClaude] = Field(default_factory=list)
    vocabulary_list: list[str] = Field(default_factory=list, alias="vocabularyList")

    model_config = {"populate_by_name": True}

    @field_validator("vocabulary_list", mode="before")
    @classmethod
    def coerce_vocab(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(v) for v in value if str(v).strip()]
        return []
