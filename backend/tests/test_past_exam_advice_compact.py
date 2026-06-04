from app.services.past_exam_advice_compact import compact_past_exam_advice_payload


def test_compact_past_exam_advice_strips_per_question_fields():
    payload = {
        "overallSummary": "①総評",
        "readinessVsExam": "①準備度",
        "questionInsights": [{"questionOrder": 1, "performanceSummary": "x"}],
        "teacherTalkingPoints": ["面談"],
        "adviceCards": [
            {"title": "1", "body": "a", "category": "grammar", "priority": "high"},
            {"title": "2", "body": "b", "category": "grammar", "priority": "high"},
            {"title": "3", "body": "c", "category": "grammar", "priority": "high"},
            {"title": "4", "body": "d", "category": "grammar", "priority": "high"},
        ],
    }
    compact = compact_past_exam_advice_payload(payload)
    assert compact["questionInsights"] == []
    assert compact["teacherTalkingPoints"] == []
    assert len(compact["adviceCards"]) == 3
