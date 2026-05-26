from pydantic import BaseModel, Field

from app.ai.schemas.grading import AdviceCard


class QuestionPastExamInsight(BaseModel):
    question_order: int = Field(alias="questionOrder")
    matched_type_label: str = Field(alias="matchedTypeLabel", default="")
    performance_summary: str = Field(alias="performanceSummary")
    past_exam_connection: str = Field(alias="pastExamConnection")
    study_action: str = Field(alias="studyAction")
    referenced_past_questions: list[str] = Field(
        default_factory=list, alias="referencedPastQuestions"
    )

    model_config = {"populate_by_name": True}


class SessionPastExamAdviceResponse(BaseModel):
    overall_summary: str = Field(alias="overallSummary")
    university_slug: str = Field(alias="universitySlug", default="todai")
    readiness_vs_exam: str = Field(alias="readinessVsExam")
    question_insights: list[QuestionPastExamInsight] = Field(
        default_factory=list, alias="questionInsights"
    )
    teacher_talking_points: list[str] = Field(
        default_factory=list, alias="teacherTalkingPoints"
    )
    advice_cards: list[AdviceCard] = Field(default_factory=list, alias="adviceCards")

    model_config = {"populate_by_name": True}
