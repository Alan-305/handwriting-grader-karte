from pydantic import BaseModel, Field, field_validator


def _null_to_str(value: object) -> object:
    return "" if value is None else value


def _coerce_int(value: object, default: int) -> int:
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


class RevisionSuggestion(BaseModel):
    field: str = Field(description="prompt | modelAnswer | points | instructions")
    current_excerpt: str = Field(alias="currentExcerpt", default="")
    proposed_text: str = Field(alias="proposedText")
    reason: str

    model_config = {"populate_by_name": True}


class QuestionValidityItem(BaseModel):
    question_order: int = Field(alias="questionOrder")
    matched_type_label: str = Field(alias="matchedTypeLabel", default="")
    coverage: str = Field(description="sufficient | partial | insufficient")
    summary: str
    improvements: list[str] = Field(default_factory=list)
    referenced_past_questions: list[str] = Field(alias="referencedPastQuestions", default_factory=list)
    revision_suggestions: list[RevisionSuggestion] = Field(alias="revisionSuggestions", default_factory=list)

    model_config = {"populate_by_name": True}


class ValidityCheckResponse(BaseModel):
    overall_summary: str = Field(alias="overallSummary")
    university_slug: str = Field(alias="universitySlug")
    items: list[QuestionValidityItem] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class GeneratedQuestionItem(BaseModel):
    type_label: str = Field(alias="typeLabel")
    major_order: int = Field(alias="majorOrder")
    part_label: str | None = Field(alias="partLabel", default=None)
    prompt: str
    model_answer: str = Field(alias="modelAnswer")
    points: int = 10
    type: str = "english"
    answer_format: str | None = Field(alias="answerFormat", default=None)
    notes: str = ""
    reference_examples: list[str] = Field(alias="referenceExamples", default_factory=list)
    # 生徒がしがちな想定誤答（指導・採点準備用）
    anticipated_mistakes: list[str] = Field(
        alias="anticipatedMistakes", default_factory=list
    )

    model_config = {"populate_by_name": True}

    @field_validator("type_label", "prompt", "model_answer", "notes", mode="before")
    @classmethod
    def coerce_optional_strings(cls, value: object) -> object:
        return _null_to_str(value)

    @field_validator("major_order", mode="before")
    @classmethod
    def coerce_major_order(cls, value: object) -> int:
        return _coerce_int(value, 1)

    @field_validator("points", mode="before")
    @classmethod
    def coerce_points(cls, value: object) -> int:
        return _coerce_int(value, 10)

    @field_validator("part_label", mode="before")
    @classmethod
    def coerce_part_label(cls, value: object) -> object:
        if value is None or value == "":
            return None
        return str(value).strip() or None

    @field_validator("reference_examples", "anticipated_mistakes", mode="before")
    @classmethod
    def coerce_str_list(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [value] if value.strip() else []
        if isinstance(value, list):
            return [str(x).strip() for x in value if str(x).strip()]
        return []


class GenerateQuestionsResponse(BaseModel):
    batch_id: str = Field(alias="batchId")
    draft_ids: list[str] = Field(alias="draftIds")
    questions: list[GeneratedQuestionItem] = Field(default_factory=list)

    model_config = {"populate_by_name": True}
