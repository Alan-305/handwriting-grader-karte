from pydantic import BaseModel, Field, field_validator

Q2A_WORD_MIN = 60
Q2A_WORD_MAX = 80


class Q2ASampleAnswer(BaseModel):
    stance_label_ja: str = Field(alias="stanceLabelJa")
    english: str
    word_count: int = Field(alias="wordCount", default=0)

    model_config = {"populate_by_name": True}


class Q2AAnswerExplanation(BaseModel):
    answer_index: int = Field(alias="answerIndex", ge=1, le=2)
    logical_structure_ja: str = Field(alias="logicalStructureJa")
    strengths_ja: str = Field(alias="strengthsJa")

    model_config = {"populate_by_name": True}


class Q2AGenerationResult(BaseModel):
    theme: str = ""
    question_format: str = Field(
        alias="questionFormat",
        default="",
        description="proverb_opinion | future_prediction | value_definition | composite",
    )
    question_prompt: str = Field(alias="questionPrompt", default="")
    sample_answers: list[Q2ASampleAnswer] = Field(alias="sampleAnswers", default_factory=list)
    translations_ja: list[str] = Field(alias="translationsJa", default_factory=list)
    answer_explanations: list[Q2AAnswerExplanation] = Field(
        alias="answerExplanations", default_factory=list
    )
    useful_expressions: list[str] = Field(alias="usefulExpressions", default_factory=list)
    deduction_points_ja: list[str] = Field(alias="deductionPointsJa", default_factory=list)
    common_mistakes_ja: list[str] = Field(alias="commonMistakesJa", default_factory=list)
    source_note: str = Field(alias="sourceNote", default="")

    model_config = {"populate_by_name": True}

    @field_validator(
        "sample_answers",
        "translations_ja",
        "answer_explanations",
        "useful_expressions",
        "deduction_points_ja",
        "common_mistakes_ja",
        mode="before",
    )
    @classmethod
    def coerce_lists(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class Q2AValidatorResult(BaseModel):
    passed: bool = True
    issues: list[str] = Field(default_factory=list)
    summary: str = ""

    model_config = {"populate_by_name": True}
