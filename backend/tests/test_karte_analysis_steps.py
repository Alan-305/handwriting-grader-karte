from unittest.mock import MagicMock, patch

import pytest

from app.services.karte_service import KARTE_ANALYSIS_TOTAL_STEPS, KarteService


@pytest.fixture
def service():
    with patch.object(KarteService, "__init__", lambda self: None):
        svc = KarteService()
        svc.firebase = MagicMock()
        svc.session_service = MagicMock()
        svc.gemini = MagicMock()
        return svc


def test_begin_analysis_returns_four_steps(service):
    ctx = {
        "context_block": "ctx",
        "session_ids": ["s1"],
        "error_stats": {"時制ミス": 1},
        "target_unis": [],
        "interview_profile": {},
    }
    with patch.object(service, "_build_karte_context", return_value=ctx):
        payload = service.begin_analysis("student-1", "teacher-1")

    assert payload["total"] == KARTE_ANALYSIS_TOTAL_STEPS
    service.firebase.set_nested_doc.assert_called_once()


def test_analysis_step_finalizes_snapshot(service):
    job = {
        "teacherId": "teacher-1",
        "context": {
            "context_block": "ctx",
            "session_ids": ["s1"],
            "error_stats": {"時制ミス": 1},
            "target_unis": [],
            "interview_profile": {},
        },
        "diagnosis": {"weaknessSummary": "要約", "weaknesses": []},
        "readiness": {
            "readinessComment": "コメント",
            "byArea": [],
            "priorityAreas": [],
        },
        "plan": {
            "adviceCards": [
                {
                    "title": "時制",
                    "body": "復習",
                    "category": "grammar",
                    "priority": "high",
                }
            ],
            "nextSessionPlan": {
                "focus": "時制",
                "recommendedQuestionTypes": [],
                "drillSuggestions": [],
            },
        },
    }
    service.firebase.get_nested_doc.return_value = job
    service.firebase.add_subdoc.return_value = "snap-1"
    service.gemini.model_name = "gemini-2.5-flash-lite"
    service.gemini.model = object()

    with patch.object(service, "_run_integrity_check") as integrity_mock:
        integrity_mock.return_value.passed = True
        integrity_mock.return_value.violations = []
        integrity_mock.return_value.fabrication_risk = []
        payload = service.analysis_step("student-1", "teacher-1", 3)

    assert payload["done"] is True
    assert payload["snapshot"]["id"] == "snap-1"
    service.firebase.delete_nested_doc.assert_called_once()
