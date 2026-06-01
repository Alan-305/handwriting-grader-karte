"""多段カルテ分析の各ステージ用レスポンススキーマ。

Gemini の応答は形式ゆらぎがあるため、question_design と同様に
field_validator で寛容に正規化してから利用する。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

WeaknessCategory = Literal["grammar", "vocabulary", "structure", "exam_strategy"]
Severity = Literal["high", "medium", "low"]
Trend = Literal["improving", "flat", "worsening"]
AdviceCategory = Literal["grammar", "vocabulary", "structure", "exam_strategy"]
AdvicePriority = Literal["high", "medium", "low"]

_CATEGORY_ALIASES: dict[str, str] = {
    "grammar": "grammar",
    "文法": "grammar",
    "vocabulary": "vocabulary",
    "語彙": "vocabulary",
    "structure": "structure",
    "構造": "structure",
    "構成": "structure",
    "exam_strategy": "exam_strategy",
    "examstrategy": "exam_strategy",
    "strategy": "exam_strategy",
    "試験対策": "exam_strategy",
    "対策": "exam_strategy",
}

_SEVERITY_ALIASES: dict[str, str] = {
    "high": "high",
    "高": "high",
    "medium": "medium",
    "中": "medium",
    "low": "low",
    "低": "low",
}

_TREND_ALIASES: dict[str, str] = {
    "improving": "improving",
    "改善": "improving",
    "flat": "flat",
    "横ばい": "flat",
    "worsening": "worsening",
    "悪化": "worsening",
}

_PRIORITY_ALIASES: dict[str, str] = {
    "high": "high",
    "高": "high",
    "medium": "medium",
    "中": "medium",
    "low": "low",
    "低": "low",
}


def _normalize_key(value: object, aliases: dict[str, str], default: str) -> str:
    if value is None:
        return default
    key = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    if key in aliases:
        return aliases[key]
    compact = key.replace("_", "")
    for alias_key, alias_val in aliases.items():
        if alias_key.replace("_", "") == compact:
            return alias_val
    return default


def _coerce_str_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x or "").strip()]
    return []


def _coerce_optional_str(value: object, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip() or default


class KarteAdviceCard(BaseModel):
    """カルテ用アドバイスカード（Gemini 応答のゆらぎを許容）。"""

    title: str = ""
    body: str = ""
    category: AdviceCategory = "grammar"
    priority: AdvicePriority = "medium"

    model_config = {"populate_by_name": True}

    @field_validator("title", "body", mode="before")
    @classmethod
    def coerce_text(cls, value: object) -> str:
        return _coerce_optional_str(value)

    @field_validator("category", mode="before")
    @classmethod
    def coerce_category(cls, value: object) -> str:
        return _normalize_key(value, _CATEGORY_ALIASES, "grammar")

    @field_validator("priority", mode="before")
    @classmethod
    def coerce_priority(cls, value: object) -> str:
        return _normalize_key(value, _PRIORITY_ALIASES, "medium")


class WeaknessItem(BaseModel):
    label: str = ""
    category: WeaknessCategory = "grammar"
    severity: Severity = "medium"
    trend: Trend = "flat"
    error_tags: list[str] = Field(default_factory=list, alias="errorTags")
    evidence: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}

    @field_validator("label", mode="before")
    @classmethod
    def coerce_label(cls, value: object) -> str:
        return _coerce_optional_str(value, "その他")

    @field_validator("category", mode="before")
    @classmethod
    def coerce_category(cls, value: object) -> str:
        return _normalize_key(value, _CATEGORY_ALIASES, "grammar")

    @field_validator("severity", mode="before")
    @classmethod
    def coerce_severity(cls, value: object) -> str:
        return _normalize_key(value, _SEVERITY_ALIASES, "medium")

    @field_validator("trend", mode="before")
    @classmethod
    def coerce_trend(cls, value: object) -> str:
        return _normalize_key(value, _TREND_ALIASES, "flat")

    @field_validator("error_tags", "evidence", mode="before")
    @classmethod
    def coerce_str_list(cls, value: object) -> list[str]:
        return _coerce_str_list(value)


class DiagnosisResult(BaseModel):
    weakness_summary: str = Field(default="", alias="weaknessSummary")
    weaknesses: list[WeaknessItem] = Field(default_factory=list)

    model_config = {"populate_by_name": True}

    @field_validator("weakness_summary", mode="before")
    @classmethod
    def coerce_summary(cls, value: object) -> str:
        return _coerce_optional_str(value, "添削履歴から読み取れる傾向を分析しました。")

    @field_validator("weaknesses", mode="before")
    @classmethod
    def coerce_weaknesses(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class SubjectReadiness(BaseModel):
    area: str = ""
    current_level: str = Field(default="", alias="currentLevel")
    target_level: str = Field(default="", alias="targetLevel")
    gap_comment: str = Field(default="", alias="gapComment")

    model_config = {"populate_by_name": True}

    @field_validator("area", "current_level", "target_level", "gap_comment", mode="before")
    @classmethod
    def coerce_text(cls, value: object) -> str:
        return _coerce_optional_str(value)


class ReadinessResult(BaseModel):
    readiness_comment: str = Field(default="", alias="readinessComment")
    by_area: list[SubjectReadiness] = Field(default_factory=list, alias="byArea")
    priority_areas: list[str] = Field(default_factory=list, alias="priorityAreas")

    model_config = {"populate_by_name": True}

    @field_validator("readiness_comment", mode="before")
    @classmethod
    def coerce_comment(cls, value: object) -> str:
        return _coerce_optional_str(value, "登録志望校に向けて、引き続き力を伸ばしていきましょう。")

    @field_validator("priority_areas", mode="before")
    @classmethod
    def coerce_priority_areas(cls, value: object) -> list[str]:
        return _coerce_str_list(value)

    @field_validator("by_area", mode="before")
    @classmethod
    def coerce_by_area(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class NextSessionPlan(BaseModel):
    focus: str = ""
    recommended_question_types: list[str] = Field(
        default_factory=list, alias="recommendedQuestionTypes"
    )
    drill_suggestions: list[str] = Field(default_factory=list, alias="drillSuggestions")

    model_config = {"populate_by_name": True}

    @field_validator("focus", mode="before")
    @classmethod
    def coerce_focus(cls, value: object) -> str:
        return _coerce_optional_str(value)

    @field_validator("recommended_question_types", "drill_suggestions", mode="before")
    @classmethod
    def coerce_lists(cls, value: object) -> list[str]:
        return _coerce_str_list(value)


class AdvicePlanResult(BaseModel):
    advice_cards: list[KarteAdviceCard] = Field(default_factory=list, alias="adviceCards")
    next_session_plan: NextSessionPlan = Field(
        default_factory=NextSessionPlan, alias="nextSessionPlan"
    )

    model_config = {"populate_by_name": True}

    @field_validator("advice_cards", mode="before")
    @classmethod
    def coerce_cards(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class IntegrityCheck(BaseModel):
    passed: bool = True
    violations: list[str] = Field(default_factory=list)
    fabrication_risk: list[str] = Field(default_factory=list, alias="fabricationRisk")

    model_config = {"populate_by_name": True}

    @field_validator("passed", mode="before")
    @classmethod
    def coerce_passed(cls, value: object) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"true", "1", "yes", "ok"}
        return bool(value)

    @field_validator("violations", "fabrication_risk", mode="before")
    @classmethod
    def coerce_str_list(cls, value: object) -> list[str]:
        return _coerce_str_list(value)
