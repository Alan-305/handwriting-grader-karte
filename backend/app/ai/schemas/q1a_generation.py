from pydantic import BaseModel, Field, field_validator


class Q1AScoringPoint(BaseModel):
    point_ja: str = Field(alias="pointJa")
    points_hint: str = Field(alias="pointsHint", default="")

    model_config = {"populate_by_name": True}


class Q1AParagraphMemo(BaseModel):
    paragraph_index: int = Field(alias="paragraphIndex", ge=1)
    summary_ja: str = Field(alias="summaryJa")

    model_config = {"populate_by_name": True}


class Q1AGenerationResult(BaseModel):
    theme: str = ""
    passage: str = ""
    word_count: int = Field(alias="wordCount", default=0)
    instruction_ja: str = Field(alias="instructionJa", default="")
    opening_constraint: str = Field(alias="openingConstraint", default="")
    model_answer_ja: str = Field(alias="modelAnswerJa", default="")
    char_count: int = Field(alias="charCount", default=0)
    scoring_points: list[Q1AScoringPoint] = Field(alias="scoringPoints", default_factory=list)
    paragraph_memos: list[Q1AParagraphMemo] = Field(alias="paragraphMemos", default_factory=list)
    summarization_process_ja: str = Field(alias="summarizationProcessJa", default="")
    common_mistakes_ja: list[str] = Field(alias="commonMistakesJa", default_factory=list)
    source_note: str = Field(alias="sourceNote", default="")

    model_config = {"populate_by_name": True}

    @field_validator("scoring_points", "paragraph_memos", "common_mistakes_ja", mode="before")
    @classmethod
    def coerce_lists(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class Q1AValidatorResult(BaseModel):
    passed: bool = True
    issues: list[str] = Field(default_factory=list)
    summary: str = ""

    model_config = {"populate_by_name": True}
