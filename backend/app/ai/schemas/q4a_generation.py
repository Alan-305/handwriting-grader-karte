from pydantic import BaseModel, Field, field_validator


class Q4AUnderlinedPart(BaseModel):
    label: str
    text: str

    model_config = {"populate_by_name": True}


class Q4AItem(BaseModel):
    number: int = Field(ge=1, le=5)
    item_label: str = Field(alias="itemLabel", default="")
    instruction_ja: str = Field(
        alias="instructionJa",
        default="",
        description="各パラグラフ用の日本語指示。東大第4問(A)では空文字にする",
    )
    english_block: str = Field(alias="englishBlock", default="")
    parts: list[Q4AUnderlinedPart] = Field(default_factory=list)
    error_label: str = Field(alias="errorLabel", default="")
    error_category: str = Field(
        alias="errorCategory",
        default="",
        description="grammar|usage|syntax|context",
    )

    model_config = {"populate_by_name": True}

    @field_validator("parts", mode="before")
    @classmethod
    def coerce_parts(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class Q4AProblemResult(BaseModel):
    instructions: str = ""
    layout: str = Field(default="five_paragraphs")
    source_note: str = Field(alias="sourceNote", default="")
    items: list[Q4AItem] = Field(default_factory=list)

    model_config = {"populate_by_name": True}

    @field_validator("items", mode="before")
    @classmethod
    def coerce_items(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class Q4AValidatorResult(BaseModel):
    passed: bool = True
    issues: list[str] = Field(default_factory=list)
    summary: str = ""

    model_config = {"populate_by_name": True}


class Q4AExplanationItem(BaseModel):
    number: int
    error_label: str = Field(alias="errorLabel")
    error_category: str = Field(alias="errorCategory", default="")
    explanation_ja: str = Field(alias="explanationJa")
    correction_en: str = Field(alias="correctionEn", default="")

    model_config = {"populate_by_name": True}


class Q4ATeacherPackResult(BaseModel):
    model_answer_summary: str = Field(alias="modelAnswerSummary")
    explanations: list[Q4AExplanationItem] = Field(default_factory=list)

    model_config = {"populate_by_name": True}
