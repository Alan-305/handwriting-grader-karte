from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

QuestionType = Literal["english", "japanese", "symbol"]
AnswerFormat = Literal["japanese_writing", "english_writing", "symbol", "composite"]
ProfileStatus = Literal["draft", "approved"]
ModelAnswerSource = Literal["official", "teacher", "ai_draft", "none"]


def _null_to_str(value: object) -> object:
    return "" if value is None else value


def _coerce_parse_notes(value: object) -> str:
    """Gemini が parseNotes に [] や文字列の配列を返すことがある。"""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        lines = [str(x).strip() for x in value if str(x).strip()]
        return "\n".join(lines)
    return str(value)


# AI が type と answerFormat を取り違えたときの救済（PastExamService._enrich が最終確定）
_ANSWER_FORMAT_LIKE = frozenset({"japanese_writing", "english_writing", "symbol", "composite"})
_VALID_QUESTION_TYPES = frozenset({"english", "japanese", "symbol"})

_PROMPT_KEYS = (
    "prompt",
    "questionText",
    "instructions",
    "instruction",
    "stem",
    "problemText",
    "problem",
    "question",
    "questionStem",
    "passage",
    "readingPassage",
    "englishPassage",
    "passageText",
    "englishText",
    "readingText",
    "dialogue",
    "script",
    "text",
    "body",
    "content",
)

_MODEL_ANSWER_KEYS = (
    "modelAnswer",
    "model_answer",
    "answer",
    "officialAnswer",
    "sampleAnswer",
    "solution",
    "correctAnswer",
    "explanation",
)

_NESTED_OBJECT_KEYS = ("passage", "reading", "english", "dialogue", "script", "material", "question")


def _dedupe_blocks(blocks: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for block in blocks:
        text = block.strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def _gather_strings(value: object, *, depth: int = 0) -> list[str]:
    if depth > 2:
        return []
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            parts.extend(_gather_strings(item, depth=depth + 1))
        return parts
    if isinstance(value, dict):
        parts = []
        for key in _PROMPT_KEYS + _MODEL_ANSWER_KEYS + _NESTED_OBJECT_KEYS:
            if key in value:
                parts.extend(_gather_strings(value[key], depth=depth + 1))
        return parts
    return []


def _extract_joined(d: dict[str, Any], keys: tuple[str, ...]) -> str:
    blocks: list[str] = []
    for key in keys:
        blocks.extend(_gather_strings(d.get(key)))
    for key in _NESTED_OBJECT_KEYS:
        nested = d.get(key)
        if isinstance(nested, dict):
            for sub_key in keys:
                blocks.extend(_gather_strings(nested.get(sub_key)))
    return "\n\n".join(_dedupe_blocks(blocks))


def _normalize_parsed_question_dict(data: dict[str, Any]) -> dict[str, Any]:
    """Gemini の過去問 JSON で type/prompt がスキーマとずれる場合の前処理。"""
    out = dict(data)

    prompt_text = _extract_joined(out, _PROMPT_KEYS)
    answer_text = _extract_joined(out, _MODEL_ANSWER_KEYS)
    out["prompt"] = prompt_text
    if answer_text:
        out["modelAnswer"] = answer_text

    raw_type = out.get("type")
    type_str = raw_type.strip().lower() if isinstance(raw_type, str) else ""

    af = out.get("answerFormat") or out.get("answer_format")
    af_str = af.strip().lower() if isinstance(af, str) else ""

    if type_str in _ANSWER_FORMAT_LIKE:
        if not af_str:
            out["answerFormat"] = type_str
        if type_str == "symbol":
            out["type"] = "symbol"
        else:
            out["type"] = "english"
    elif type_str and type_str not in _VALID_QUESTION_TYPES:
        out["type"] = "english"
    elif not type_str:
        out["type"] = "english"

    return out


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
    prompt: str = ""
    model_answer: str = Field(default="", alias="modelAnswer")
    points: float | None = None
    notes: str = ""

    model_config = {"populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def normalize_ai_payload(cls, data: object) -> object:
        if isinstance(data, dict):
            return _normalize_parsed_question_dict(data)
        return data

    @field_validator("notes", "model_answer", "prompt", mode="before")
    @classmethod
    def coerce_optional_strings(cls, value: object) -> object:
        return _null_to_str(value)


class ListeningScript(BaseModel):
    """リスニング音声用スクリプト（大問ではない付録）。"""

    title: str = ""
    content: str = ""
    notes: str = ""

    model_config = {"populate_by_name": True}

    @model_validator(mode="before")
    @classmethod
    def normalize_ai_payload(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        out = dict(data)
        script_text = _extract_joined(
            out,
            (
                "content",
                "script",
                "dialogue",
                "passage",
                "englishText",
                "englishPassage",
                "text",
                "body",
            ),
        )
        out["content"] = script_text
        if not _null_to_str(out.get("title")):
            out["title"] = str(out.get("title") or "")
        return out

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
    def coerce_parse_notes(cls, value: object) -> str:
        return _coerce_parse_notes(value)


class ParsedAnswerUpdate(BaseModel):
    major_order: int = Field(ge=1, alias="majorOrder")
    part_label: str | None = Field(default=None, alias="partLabel")
    model_answer: str = Field(default="", alias="modelAnswer")

    model_config = {"populate_by_name": True}

    @field_validator("model_answer", mode="before")
    @classmethod
    def coerce_model_answer(cls, value: object) -> object:
        return _null_to_str(value)


class PastExamAnswersUpdateResponse(BaseModel):
    questions: list[ParsedAnswerUpdate]
    parse_notes: str = Field(default="", alias="parseNotes")

    model_config = {"populate_by_name": True}

    @field_validator("parse_notes", mode="before")
    @classmethod
    def coerce_parse_notes(cls, value: object) -> str:
        return _coerce_parse_notes(value)


class PastExamParseResponse(BaseModel):
    university_name: str = Field(default="", alias="universityName")
    year: int
    exam_type: str = Field(default="secondary", alias="examType")
    questions: list[ParsedPastQuestion]
    listening_scripts: list[ListeningScript] = Field(default_factory=list, alias="listeningScripts")
    parse_notes: str = Field(default="", alias="parseNotes")

    model_config = {"populate_by_name": True}

    @field_validator("university_name", "exam_type", mode="before")
    @classmethod
    def coerce_optional_strings(cls, value: object) -> object:
        return _null_to_str(value)

    @field_validator("parse_notes", mode="before")
    @classmethod
    def coerce_parse_notes(cls, value: object) -> str:
        return _coerce_parse_notes(value)
