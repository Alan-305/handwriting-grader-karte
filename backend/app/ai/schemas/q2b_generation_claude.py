"""Claude structured output 用の簡略スキーマ（ネストオブジェクトを避ける）。"""

from pydantic import BaseModel, Field, field_validator


def _coerce_str_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return []


class Q2BProblemClaudeResult(BaseModel):
    """和文問題＋解答例のみ（第1段階）。"""

    theme: str = ""
    genre: str = ""
    instruction_ja: str = Field(default="以下の日本文の下線部を英訳せよ。", alias="instructionJa")
    japanese_passage: str = Field(default="", alias="japanesePassage")
    underlined_segments_ja: list[str] = Field(default_factory=list, alias="underlinedSegmentsJa")
    sample_answers: list[str] = Field(default_factory=list, alias="sampleAnswers")
    source_note: str = Field(default="", alias="sourceNote")

    model_config = {"populate_by_name": True}

    @field_validator("underlined_segments_ja", "sample_answers", mode="before")
    @classmethod
    def coerce_lists(cls, value: object) -> list[str]:
        return _coerce_str_list(value)


class Q2BTeacherPackClaudeResult(BaseModel):
    """解説・NG訳のみ（第2段階）。"""

    wakuyaku_process_ja: str = Field(default="", alias="wakuyakuProcessJa")
    grammar_essentials_ja: list[str] = Field(default_factory=list, alias="grammarEssentialsJa")
    segment_explanations: list[str] = Field(default_factory=list, alias="segmentExplanations")
    bad_literal_translations: list[str] = Field(default_factory=list, alias="badLiteralTranslations")
    common_mistakes_ja: list[str] = Field(default_factory=list, alias="commonMistakesJa")

    model_config = {"populate_by_name": True}

    @field_validator(
        "grammar_essentials_ja",
        "segment_explanations",
        "bad_literal_translations",
        "common_mistakes_ja",
        mode="before",
    )
    @classmethod
    def coerce_lists(cls, value: object) -> list[str]:
        return _coerce_str_list(value)
