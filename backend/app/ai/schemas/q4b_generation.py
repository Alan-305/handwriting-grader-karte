from pydantic import BaseModel, Field, field_validator

Q4B_BLANK_LABELS = ("ア", "イ")


class Q4BUnderlinedSegment(BaseModel):
    blank_label: str = Field(alias="blankLabel")
    english: str
    word_count: int = Field(alias="wordCount", default=0)
    highlight_word: str = Field(
        alias="highlightWord",
        default="",
        description="イ用・指示文で明示する特定語（例: it）",
    )

    model_config = {"populate_by_name": True}


class Q4BSampleAnswer(BaseModel):
    blank_label: str = Field(alias="blankLabel")
    translation_ja: str = Field(alias="translationJa")

    model_config = {"populate_by_name": True}


class Q4BSegmentAnalysis(BaseModel):
    blank_label: str = Field(alias="blankLabel")
    syntax_tree_ja: str = Field(alias="syntaxTreeJa")
    translation_process_ja: str = Field(alias="translationProcessJa")
    required_elements_ja: list[str] = Field(alias="requiredElementsJa", default_factory=list)
    deduction_points_ja: list[str] = Field(alias="deductionPointsJa", default_factory=list)
    fatal_mistakes_ja: list[str] = Field(alias="fatalMistakesJa", default_factory=list)
    points_hint: str = Field(alias="pointsHint", default="")

    model_config = {"populate_by_name": True}


class Q4BBadTranslation(BaseModel):
    blank_label: str = Field(alias="blankLabel", default="")
    ng_translation_ja: str = Field(alias="ngTranslationJa")
    why_wrong_ja: str = Field(alias="whyWrongJa")

    model_config = {"populate_by_name": True}


class Q4BGenerationResult(BaseModel):
    theme: str = ""
    instruction_ja: str = Field(alias="instructionJa", default="")
    segment_i_extra_instruction_ja: str = Field(
        alias="segmentIExtraInstructionJa",
        default="",
        description="イ向け・特定語を明らかにする追加指示",
    )
    passage: str = ""
    word_count: int = Field(alias="wordCount", default=0)
    underlined_segments: list[Q4BUnderlinedSegment] = Field(
        alias="underlinedSegments", default_factory=list
    )
    sample_answers: list[Q4BSampleAnswer] = Field(alias="sampleAnswers", default_factory=list)
    paragraph_summary_ja: str = Field(alias="paragraphSummaryJa", default="")
    segment_analyses: list[Q4BSegmentAnalysis] = Field(
        alias="segmentAnalyses", default_factory=list
    )
    bad_translation_examples: list[Q4BBadTranslation] = Field(
        alias="badTranslationExamples", default_factory=list
    )
    common_mistakes_ja: list[str] = Field(alias="commonMistakesJa", default_factory=list)
    source_note: str = Field(alias="sourceNote", default="")

    model_config = {"populate_by_name": True}

    @field_validator(
        "underlined_segments",
        "sample_answers",
        "segment_analyses",
        "bad_translation_examples",
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


class Q4BValidatorResult(BaseModel):
    passed: bool = True
    issues: list[str] = Field(default_factory=list)
    summary: str = ""

    model_config = {"populate_by_name": True}
