from pydantic import BaseModel, Field, field_validator


class Q2BSampleAnswer(BaseModel):
    label_ja: str = Field(alias="labelJa")
    english: str
    approach: str = Field(
        default="standard",
        description="standard | paraphrase",
    )

    model_config = {"populate_by_name": True}


class Q2BBadLiteralTranslation(BaseModel):
    ng_english: str = Field(alias="ngEnglish")
    why_wrong_ja: str = Field(alias="whyWrongJa")
    suggested_rephrase_ja: str = Field(alias="suggestedRephraseJa", default="")

    model_config = {"populate_by_name": True}


class Q2BSegmentExplanation(BaseModel):
    segment_ja: str = Field(alias="segmentJa")
    literal_trap_ja: str = Field(alias="literalTrapJa")
    english_thinking_ja: str = Field(alias="englishThinkingJa")

    model_config = {"populate_by_name": True}


class Q2BGenerationResult(BaseModel):
    theme: str = ""
    genre: str = Field(
        default="",
        description="essay | novel_excerpt | dialogue",
    )
    instruction_ja: str = Field(
        alias="instructionJa",
        default="以下の日本文の下線部を英訳せよ。",
    )
    japanese_passage: str = Field(alias="japanesePassage", default="")
    underlined_segments_ja: list[str] = Field(alias="underlinedSegmentsJa", default_factory=list)
    sample_answers: list[Q2BSampleAnswer] = Field(alias="sampleAnswers", default_factory=list)
    wakuyaku_process_ja: str = Field(alias="wakuyakuProcessJa", default="")
    grammar_essentials_ja: list[str] = Field(alias="grammarEssentialsJa", default_factory=list)
    segment_explanations: list[Q2BSegmentExplanation] = Field(
        alias="segmentExplanations", default_factory=list
    )
    bad_literal_translations: list[Q2BBadLiteralTranslation] = Field(
        alias="badLiteralTranslations", default_factory=list
    )
    common_mistakes_ja: list[str] = Field(alias="commonMistakesJa", default_factory=list)
    source_note: str = Field(alias="sourceNote", default="")

    model_config = {"populate_by_name": True}

    @field_validator(
        "underlined_segments_ja",
        "sample_answers",
        "grammar_essentials_ja",
        "segment_explanations",
        "bad_literal_translations",
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


class Q2BValidatorResult(BaseModel):
    passed: bool = True
    issues: list[str] = Field(default_factory=list)
    summary: str = ""

    model_config = {"populate_by_name": True}
