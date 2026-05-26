from typing import Literal

from pydantic import BaseModel, Field


GradeLevel = Literal["優", "良", "不可"]
QuestionType = Literal["english", "japanese", "symbol"]


class GradeResult(BaseModel):
    grade: GradeLevel
    score: float = Field(ge=0)
    max_points: float = Field(ge=0, alias="maxPoints")
    student_answer_text: str = Field(default="", alias="studentAnswerText")
    feedback: str
    explanation: str
    error_tags: list[str] = Field(default_factory=list, alias="errorTags")
    teacher_notes: str = Field(default="", alias="teacherNotes")

    model_config = {"populate_by_name": True}


class EnglishCompositionGradeResult(GradeResult):
    """自由英作文: 内容・文法・完成版英文を分離して返す。"""

    content_evaluation: str = Field(alias="contentEvaluation")
    grammar_evaluation: str = Field(alias="grammarEvaluation")
    polished_answer: str = Field(alias="polishedAnswer")


class AdviceCard(BaseModel):
    title: str
    body: str
    category: Literal["grammar", "vocabulary", "structure", "exam_strategy"]
    priority: Literal["high", "medium", "low"]


class KarteAdviceResponse(BaseModel):
    weakness_summary: str = Field(alias="weaknessSummary")
    error_frequency: dict[str, int] = Field(default_factory=dict, alias="errorFrequency")
    advice_cards: list[AdviceCard] = Field(default_factory=list, alias="adviceCards")
    readiness_comment: str = Field(alias="readinessComment")

    model_config = {"populate_by_name": True}
