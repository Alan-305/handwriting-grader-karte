from pydantic import BaseModel, Field, field_validator

Q1B_BLANK_LABELS = ("ア", "イ", "ウ", "エ", "オ")
Q1B_CHOICE_LABELS = ("a", "b", "c", "d", "e", "f")


class Q1BChoice(BaseModel):
    label: str
    text: str
    is_dummy: bool = Field(alias="isDummy", default=False)

    model_config = {"populate_by_name": True}


class Q1BBlankAnswer(BaseModel):
    blank_label: str = Field(alias="blankLabel")
    correct_choice: str = Field(alias="correctChoice")

    model_config = {"populate_by_name": True}


class Q1BBlankExplanation(BaseModel):
    blank_label: str = Field(alias="blankLabel")
    correct_choice: str = Field(alias="correctChoice")
    rationale_ja: str = Field(alias="rationaleJa")
    discourse_note: str = Field(alias="discourseNote", default="")

    model_config = {"populate_by_name": True}


class Q1BDummyExplanation(BaseModel):
    choice_label: str = Field(alias="choiceLabel")
    why_wrong_ja: str = Field(alias="whyWrongJa")

    model_config = {"populate_by_name": True}


class Q1BGenerationResult(BaseModel):
    theme: str = ""
    instructions_ja: str = Field(alias="instructionsJa", default="")
    passage: str = ""
    word_count: int = Field(alias="wordCount", default=0)
    choices: list[Q1BChoice] = Field(default_factory=list)
    answers: list[Q1BBlankAnswer] = Field(default_factory=list)
    dummy_choice_label: str = Field(alias="dummyChoiceLabel", default="")
    overall_summary_ja: str = Field(alias="overallSummaryJa", default="")
    blank_explanations: list[Q1BBlankExplanation] = Field(
        alias="blankExplanations", default_factory=list
    )
    dummy_explanations: list[Q1BDummyExplanation] = Field(
        alias="dummyExplanations", default_factory=list
    )
    common_mistakes_ja: list[str] = Field(alias="commonMistakesJa", default_factory=list)
    source_note: str = Field(alias="sourceNote", default="")

    model_config = {"populate_by_name": True}

    @field_validator(
        "choices",
        "answers",
        "blank_explanations",
        "dummy_explanations",
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


class Q1BValidatorResult(BaseModel):
    passed: bool = True
    issues: list[str] = Field(default_factory=list)
    summary: str = ""

    model_config = {"populate_by_name": True}
