from typing import Literal

from pydantic import BaseModel, Field, field_validator

QuestionType = Literal["english", "japanese", "symbol"]
AnswerFormat = Literal["japanese_writing", "english_writing", "symbol", "composite"]
ProfileStatus = Literal["draft", "approved"]
ModelAnswerSource = Literal["official", "teacher", "ai_draft", "none"]


def _null_to_str(value: object) -> object:
    return "" if value is None else value


class PastQuestionProfile(BaseModel):
    archetype: str = ""
    required_skills: list[str] = Field(default_factory=list, alias="requiredSkills")
    common_traps: list[str] = Field(default_factory=list, alias="commonTraps")
    difficulty_level: int = Field(default=3, ge=1, le=5, alias="difficultyLevel")
    scoring_focus: str = Field(default="", alias="scoringFocus")

    model_config = {"populate_by_name": True}


class ParsedPastQuestion(BaseModel):
    major_order: int = Field(ge=1, alias="majorOrder")
    part_label: str | None = Field(default=None, alias="partLabel")
    type: QuestionType = "english"
    answer_format: AnswerFormat | None = Field(default=None, alias="answerFormat")
    prompt: str
    model_answer: str = Field(default="", alias="modelAnswer")
    points: float | None = None
    notes: str = ""

    model_config = {"populate_by_name": True}

    @field_validator("notes", "model_answer", "prompt", mode="before")
    @classmethod
    def coerce_optional_strings(cls, value: object) -> object:
        return _null_to_str(value)


class ListeningScript(BaseModel):
    """リスニング音声用スクリプト（大問ではない付録）。"""

    title: str = ""
    content: str
    notes: str = ""

    @field_validator("title", "content", "notes", mode="before")
    @classmethod
    def coerce_optional_strings(cls, value: object) -> object:
        return _null_to_str(value)


class ListeningScriptParseResponse(BaseModel):
    year: int
    listening_scripts: list[ListeningScript] = Field(default_factory=list, alias="listeningScripts")
    parse_notes: str = Field(default="", alias="parseNotes")

    model_config = {"populate_by_name": True}

    @field_validator("parse_notes", mode="before")
    @classmethod
    def coerce_parse_notes(cls, value: object) -> object:
        return _null_to_str(value)


class PastExamParseResponse(BaseModel):
    university_name: str = Field(default="", alias="universityName")
    year: int
    exam_type: str = Field(default="secondary", alias="examType")
    questions: list[ParsedPastQuestion]
    listening_scripts: list[ListeningScript] = Field(default_factory=list, alias="listeningScripts")
    parse_notes: str = Field(default="", alias="parseNotes")

    model_config = {"populate_by_name": True}

    @field_validator("university_name", "exam_type", "parse_notes", mode="before")
    @classmethod
    def coerce_optional_strings(cls, value: object) -> object:
        return _null_to_str(value)
