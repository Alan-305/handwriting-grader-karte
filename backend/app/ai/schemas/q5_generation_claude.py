"""Claude structured output 用の簡略スキーマ（ネスト・description を抑えて Schema is too complex を回避）。"""

from pydantic import BaseModel, Field, field_validator


def _coerce_str_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return []


class Q5SubQuestionClaude(BaseModel):
    """設問1件。choices は \"a: 英文\" 形式の文字列配列（オブジェクト配列にしない）。"""

    number: int
    part_label: str = Field(default="", alias="partLabel")
    question_type: str = Field(alias="questionType")
    prompt: str
    passage_anchor: str = Field(default="", alias="passageAnchor")
    target_word: str = Field(default="", alias="targetWord")
    underlined_text: str = Field(default="", alias="underlinedText")
    char_limit_ja: int | None = Field(default=None, alias="charLimitJa")
    direction_criterion_ja: str = Field(default="", alias="directionCriterionJa")
    required_points: list[str] = Field(default_factory=list, alias="requiredPoints")
    choices: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}

    @field_validator("required_points", "choices", mode="before")
    @classmethod
    def coerce_lists(cls, value: object) -> list[str]:
        return _coerce_str_list(value)


class Q5QuestionsClaudeResult(BaseModel):
    instructions: str = ""
    passage_for_exam: str = Field(default="", alias="passageForExam")
    questions: list[Q5SubQuestionClaude] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class Q5ExplanationClaude(BaseModel):
    number: int
    correct_choice: str = Field(default="", alias="correctChoice")
    answer_text: str = Field(default="", alias="answerText")
    explanation_ja: str = Field(alias="explanationJa")
    direction_criterion_ja: str = Field(default="", alias="directionCriterionJa")
    """必須採点ポイント（日本語・2〜4個。passageBasis は不要）"""
    required_points: list[str] = Field(default_factory=list, alias="requiredPoints")

    model_config = {"populate_by_name": True}

    @field_validator("required_points", mode="before")
    @classmethod
    def coerce_points(cls, value: object) -> list[str]:
        return _coerce_str_list(value)


class Q5TeacherPackClaudeResult(BaseModel):
    """解答・解説のみ（語彙・全訳は別途／modelAnswerSummary に含めてよい）。"""

    model_answer_summary: str = Field(alias="modelAnswerSummary")
    explanations: list[Q5ExplanationClaude] = Field(default_factory=list)

    model_config = {"populate_by_name": True}
