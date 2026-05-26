from pydantic import BaseModel, Field


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

    model_config = {"populate_by_name": True}


class GenerateQuestionsResponse(BaseModel):
    batch_id: str = Field(alias="batchId")
    draft_ids: list[str] = Field(alias="draftIds")
    questions: list[GeneratedQuestionItem] = Field(default_factory=list)

    model_config = {"populate_by_name": True}
