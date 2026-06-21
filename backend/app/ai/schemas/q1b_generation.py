from pydantic import BaseModel, Field, field_validator

Q1B_PART_A_BLANK_LABELS = ("1", "2", "3", "4", "5")
Q1B_CHOICE_LABELS = ("a", "b", "c", "d", "e", "f")
Q1B_PART_I_BLANK_LABEL = "イ"
Q1B_PART_I_MIN_WORDS = 8
Q1B_PART_I_MAX_WORDS = 12


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


class Q1BPartA(BaseModel):
    """小問（ア）: 500〜600語・空所(1)〜(5)・選択肢 a)〜f)（ダミー1つ）。"""

    instructions_ja: str = Field(alias="instructionsJa", default="")
    passage: str = ""
    word_count: int = Field(alias="wordCount", default=0)
    choices: list[Q1BChoice] = Field(default_factory=list)
    answers: list[Q1BBlankAnswer] = Field(default_factory=list)
    dummy_choice_label: str = Field(alias="dummyChoiceLabel", default="")
    blank_explanations: list[Q1BBlankExplanation] = Field(
        alias="blankExplanations", default_factory=list
    )
    dummy_explanations: list[Q1BDummyExplanation] = Field(
        alias="dummyExplanations", default_factory=list
    )

    model_config = {"populate_by_name": True}

    @field_validator(
        "choices",
        "answers",
        "blank_explanations",
        "dummy_explanations",
        mode="before",
    )
    @classmethod
    def coerce_lists(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class Q1BPartI(BaseModel):
    """小問（イ）: 長文の空所（イ）に語句8〜12個を並べ替え。"""

    instructions_ja: str = Field(alias="instructionsJa", default="")
    passage: str = ""
    word_count: int = Field(alias="wordCount", default=0)
    word_bank: list[str] = Field(alias="wordBank", default_factory=list)
    correct_order: list[str] = Field(alias="correctOrder", default_factory=list)
    correct_expression_en: str = Field(alias="correctExpressionEn", default="")
    explanation_ja: str = Field(alias="explanationJa", default="")
    structure_note_ja: str = Field(alias="structureNoteJa", default="")

    model_config = {"populate_by_name": True}

    @field_validator("word_bank", "correct_order", mode="before")
    @classmethod
    def coerce_lists(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class Q1BGenerationResult(BaseModel):
    theme: str = ""
    instructions_ja: str = Field(alias="instructionsJa", default="")
    part_a: Q1BPartA = Field(alias="partA", default_factory=Q1BPartA)
    part_i: Q1BPartI = Field(alias="partI", default_factory=Q1BPartI)
    overall_summary_ja: str = Field(alias="overallSummaryJa", default="")
    common_mistakes_ja: list[str] = Field(alias="commonMistakesJa", default_factory=list)
    source_note: str = Field(alias="sourceNote", default="")

    model_config = {"populate_by_name": True}

    @field_validator("common_mistakes_ja", mode="before")
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
