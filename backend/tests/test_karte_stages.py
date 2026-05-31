"""多段カルテ分析（Stage 1〜4）のプロンプト・スキーマ・モックの検証。

Evaluator 方針に従い、まず「意図的に制約違反を仕込んだダミー」を用意し、
整合チェック（Stage 4）がその違反情報を点検プロンプトに正しく載せられるか、
および各スキーマ・モックが破綻しないかを確認する。
"""

import pytest

from app.ai.gemini_client import _MOCK_PAYLOADS, GeminiAnalysisClient
from app.ai.prompts.karte_stages import (
    ADVICE_PLAN_SYSTEM,
    DIAGNOSIS_SYSTEM,
    INTEGRITY_SYSTEM,
    READINESS_SYSTEM,
    build_context_block,
    build_integrity_prompt,
    to_json,
)
from app.ai.schemas.karte import (
    AdvicePlanResult,
    DiagnosisResult,
    IntegrityCheck,
    ReadinessResult,
)

_TARGET_UNIS = [
    {
        "id": "u1",
        "name": "東京大学",
        "faculty": "理科三類",
        "difficultyLevel": 5,
        "examTrends": "英語重視",
        "priority": 1,
    }
]


def _context_block() -> str:
    return build_context_block(
        student_name="山田",
        target_universities=_TARGET_UNIS,
        session_summaries="Session x: 80/100点",
        error_stats={"時制ミス": 3, "スペルミス": 5},
        interview_profile={
            "targetUniversities": [
                {"universityId": "u1", "name": "東京大学", "faculty": "理科三類", "priority": 1}
            ],
            "commonTestYear": 2026,
            "commonTestScores": {"englishReading": "80_89"},
            "confirmedFactIds": ["no_other_faculty", "todai_sci_3"],
        },
        interview_records=[
            {"recordNumber": 1, "studentConsultation": "英作文が不安", "teacherAdvice": "週2本"},
        ],
        error_by_session=[
            {"order": 1, "tags": [{"tag": "時制ミス", "count": 2}]},
            {"order": 2, "tags": [{"tag": "スペルミス", "count": 1}]},
        ],
    )


def test_context_block_includes_targets_scores_and_trend():
    text = _context_block()
    assert "理科三類" in text
    assert "80〜89点" in text
    assert "英作文が不安" in text
    assert "時制ミス:3回" in text
    # 時系列（回ごと）が含まれる
    assert "第1回:" in text
    assert "第2回:" in text


def test_all_stage_systems_enforce_common_rules():
    for system in (DIAGNOSIS_SYSTEM, READINESS_SYSTEM, ADVICE_PLAN_SYSTEM):
        assert "不合格" in system  # 「使わない」という禁止指示として登場
        assert "登録" in system
    # Stage 4 は検証専用で、捏造・志望校外を検出対象に明記
    assert "捏造" in INTEGRITY_SYSTEM
    assert "不合格" in INTEGRITY_SYSTEM


def test_schemas_parse_camelcase_input():
    diag = DiagnosisResult.model_validate(
        {
            "weaknessSummary": "時制が不安定",
            "weaknesses": [
                {
                    "label": "時制",
                    "category": "grammar",
                    "severity": "high",
                    "trend": "flat",
                    "errorTags": ["時制ミス"],
                    "evidence": ["第2回 英作文"],
                }
            ],
        }
    )
    assert diag.weakness_summary == "時制が不安定"
    assert diag.weaknesses[0].error_tags == ["時制ミス"]

    readiness = ReadinessResult.model_validate(
        {
            "readinessComment": "あと一歩",
            "byArea": [{"area": "英作文", "currentLevel": "x", "targetLevel": "y", "gapComment": "z"}],
            "priorityAreas": ["英作文"],
        }
    )
    assert readiness.by_area[0].area == "英作文"
    assert readiness.priority_areas == ["英作文"]

    plan = AdvicePlanResult.model_validate(
        {
            "adviceCards": [
                {"title": "t", "body": "b", "category": "grammar", "priority": "high"}
            ],
            "nextSessionPlan": {
                "focus": "時制",
                "recommendedQuestionTypes": ["english"],
                "drillSuggestions": ["10問"],
            },
        }
    )
    assert plan.next_session_plan.focus == "時制"


@pytest.mark.parametrize(
    "schema",
    [DiagnosisResult, ReadinessResult, AdvicePlanResult, IntegrityCheck],
)
def test_mock_mode_returns_valid_instance(schema):
    """API キー未設定（モックモード）でも各ステージが破綻しないこと。"""
    client = GeminiAnalysisClient(api_key="")
    result = client.complete_structured(
        system="x", user_text="y", response_schema=schema
    )
    assert isinstance(result, schema)
    # モックペイロードがスキーマと整合している（鍵の取り違え防止）
    assert schema.__name__ in _MOCK_PAYLOADS


def test_integrity_prompt_surfaces_violation_for_verifier():
    """志望校外への言及を含むダミー生成物を点検プロンプトに載せられるか。

    Stage 4 の検証 LLM が判断できるよう、(a) 許可された志望校リストと
    (b) 違反候補テキスト の双方がプロンプトに含まれることを確認する。
    """
    diagnosis = DiagnosisResult.model_validate(
        {"weaknessSummary": "x", "weaknesses": []}
    )
    readiness = ReadinessResult.model_validate(
        {"readinessComment": "ok", "byArea": [], "priorityAreas": []}
    )
    # わざと登録外の「京都大学」への言及を仕込む
    tainted_plan = AdvicePlanResult.model_validate(
        {
            "adviceCards": [
                {
                    "title": "併願検討",
                    "body": "京都大学の医学部も視野に入れましょう。",
                    "category": "exam_strategy",
                    "priority": "high",
                }
            ],
            "nextSessionPlan": {"focus": "", "recommendedQuestionTypes": [], "drillSuggestions": []},
        }
    )

    prompt = build_integrity_prompt(
        allowed_universities=_TARGET_UNIS,
        diagnosis_json=to_json(diagnosis),
        readiness_json=to_json(readiness),
        advice_plan_json=to_json(tainted_plan),
        common_test_scores={"englishReading": "80_89"},
    )

    # 許可リストには東京大学のみ
    assert "東京大学" in prompt
    # 違反候補（京都大学）が点検対象として載っている
    assert "京都大学" in prompt
    # 共通テスト得点帯も点検対象に含む
    assert "80〜89点" in prompt


def test_to_json_uses_aliases():
    diag = DiagnosisResult.model_validate(
        {
            "weaknessSummary": "x",
            "weaknesses": [
                {"label": "時制", "errorTags": ["時制ミス"], "evidence": ["第1回"]}
            ],
        }
    )
    out = to_json(diag)
    assert "weaknessSummary" in out
    assert "errorTags" in out
