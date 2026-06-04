from datetime import datetime, timezone

from app.services.past_exam_advice_history import (
    format_previous_advice_block,
    pick_previous_advice_sessions,
)


def _session(
    sid: str,
    *,
    teacher_id: str = "t1",
    student_id: str = "s1",
    advice: dict | None = None,
    when: datetime | None = None,
):
    return {
        "id": sid,
        "teacherId": teacher_id,
        "studentId": student_id,
        "sessionDate": when or datetime(2026, 1, 1, tzinfo=timezone.utc),
        "pastExamAdvice": advice,
    }


def _advice(slug: str = "todai", summary: str = "前回の総評"):
    return {
        "overallSummary": summary,
        "universitySlug": slug,
        "readinessVsExam": "準備度コメント",
        "teacherTalkingPoints": ["要点A"],
        "questionInsights": [
            {
                "questionOrder": 1,
                "matchedTypeLabel": "第1問",
                "performanceSummary": "出来概要",
                "pastExamConnection": "過去問関係",
                "studyAction": "次の学習",
            }
        ],
        "adviceCards": [{"title": "カード1", "body": "本文", "category": "grammar", "priority": "high"}],
    }


def test_pick_previous_excludes_current_and_prefers_same_slug():
    sessions = [
        _session("cur", advice=None, when=datetime(2026, 3, 1, tzinfo=timezone.utc)),
        _session(
            "old-other",
            advice=_advice("kyoto", "京都"),
            when=datetime(2026, 2, 1, tzinfo=timezone.utc),
        ),
        _session(
            "old-todai",
            advice=_advice("todai", "東大前回"),
            when=datetime(2026, 1, 15, tzinfo=timezone.utc),
        ),
    ]
    picked = pick_previous_advice_sessions(
        sessions,
        current_session_id="cur",
        teacher_id="t1",
        university_slug="todai",
        limit=1,
    )
    assert len(picked) == 1
    assert picked[0]["id"] == "old-todai"


def test_pick_previous_falls_back_to_latest_any_slug():
    sessions = [
        _session("cur", advice=None),
        _session(
            "only",
            advice=_advice("kyoto", "唯一"),
            when=datetime(2026, 2, 1, tzinfo=timezone.utc),
        ),
    ]
    picked = pick_previous_advice_sessions(
        sessions,
        current_session_id="cur",
        teacher_id="t1",
        university_slug="todai",
        limit=1,
    )
    assert picked[0]["id"] == "only"


def test_format_previous_advice_block_contains_key_fields():
    advice = _advice()
    block = format_previous_advice_block(
        [(_session("prev", advice=advice), advice, "模試第3回")]
    )
    assert "前回以前の過去問アドバイス" in block
    assert "模試第3回" in block
    assert "前回の総評" in block
    assert "カード1" in block
