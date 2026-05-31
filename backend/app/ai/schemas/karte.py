"""多段カルテ分析の各ステージ用レスポンススキーマ。

Stage 1: 弱点診断 (DiagnosisResult)
Stage 2: 志望校ギャップ分析 (ReadinessResult)
Stage 3: 指導プラン生成 (AdvicePlanResult)
Stage 4: 整合チェック (IntegrityCheck)

AdviceCard は既存 grading スキーマを再利用する。
"""

from typing import Literal

from pydantic import BaseModel, Field

from app.ai.schemas.grading import AdviceCard

WeaknessCategory = Literal["grammar", "vocabulary", "structure", "exam_strategy"]
Severity = Literal["high", "medium", "low"]
Trend = Literal["improving", "flat", "worsening"]


class WeaknessItem(BaseModel):
    """根拠付きの弱点1件。evidence を必須にして憶測の弱点を抑止する。"""

    label: str
    category: WeaknessCategory = "grammar"
    severity: Severity = "medium"
    trend: Trend = "flat"
    error_tags: list[str] = Field(default_factory=list, alias="errorTags")
    # 根拠（例: "第3回 第4問: 過去形→現在完了の誤り"）。空でも壊さないが原則必須。
    evidence: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class DiagnosisResult(BaseModel):
    weakness_summary: str = Field(alias="weaknessSummary")
    weaknesses: list[WeaknessItem] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class SubjectReadiness(BaseModel):
    area: str
    current_level: str = Field(default="", alias="currentLevel")
    target_level: str = Field(default="", alias="targetLevel")
    gap_comment: str = Field(default="", alias="gapComment")

    model_config = {"populate_by_name": True}


class ReadinessResult(BaseModel):
    readiness_comment: str = Field(alias="readinessComment")
    by_area: list[SubjectReadiness] = Field(default_factory=list, alias="byArea")
    priority_areas: list[str] = Field(default_factory=list, alias="priorityAreas")

    model_config = {"populate_by_name": True}


class NextSessionPlan(BaseModel):
    focus: str = ""
    recommended_question_types: list[str] = Field(
        default_factory=list, alias="recommendedQuestionTypes"
    )
    drill_suggestions: list[str] = Field(default_factory=list, alias="drillSuggestions")

    model_config = {"populate_by_name": True}


class AdvicePlanResult(BaseModel):
    advice_cards: list[AdviceCard] = Field(default_factory=list, alias="adviceCards")
    next_session_plan: NextSessionPlan = Field(
        default_factory=NextSessionPlan, alias="nextSessionPlan"
    )

    model_config = {"populate_by_name": True}


class IntegrityCheck(BaseModel):
    """Stage 4: 生成物がプロジェクト制約に反していないか自己検証する。"""

    passed: bool = True
    # 制約違反（例: 志望校外への言及、「不合格」語の使用）
    violations: list[str] = Field(default_factory=list)
    # 事実・得点の捏造疑い
    fabrication_risk: list[str] = Field(default_factory=list, alias="fabricationRisk")

    model_config = {"populate_by_name": True}
