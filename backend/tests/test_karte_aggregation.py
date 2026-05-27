"""Tests for karte_aggregation."""

from datetime import datetime, timezone

from app.services.karte_aggregation import dedupe_completed_for_karte


def _sess(
    sid: str,
    test_id: str,
    *,
    status: str = "completed",
    session_date: datetime,
    confirmed: datetime | None = None,
) -> dict:
    row = {
        "id": sid,
        "testId": test_id,
        "status": status,
        "sessionDate": session_date,
    }
    if confirmed:
        row["gradingConfirmedAt"] = confirmed
    return row


def test_dedupe_keeps_latest_completed_per_test():
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    t1 = datetime(2026, 2, 1, tzinfo=timezone.utc)
    rows = [
        _sess("s1", "testA", session_date=t0, confirmed=t0),
        _sess("s2", "testA", session_date=t1, confirmed=t1),
    ]
    out = dedupe_completed_for_karte(rows)
    assert len(out) == 1
    assert out[0]["id"] == "s2"
    assert out[0]["totalScore"] if "totalScore" in out[0] else True


def test_dedupe_preserves_two_distinct_tests():
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    t1 = datetime(2026, 2, 1, tzinfo=timezone.utc)
    rows = [
        _sess("s1", "testA", session_date=t0, confirmed=t0),
        _sess("s2", "testB", session_date=t1, confirmed=t1),
    ]
    out = dedupe_completed_for_karte(rows)
    assert [s["id"] for s in out] == ["s1", "s2"]


def test_dedupe_order_by_first_attempt_not_latest():
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    t1 = datetime(2026, 2, 1, tzinfo=timezone.utc)
    t2 = datetime(2026, 3, 1, tzinfo=timezone.utc)
    rows = [
        _sess("s1", "testA", session_date=t0, confirmed=t0),
        _sess("s2", "testB", session_date=t1, confirmed=t1),
        _sess("s3", "testA", session_date=t2, confirmed=t2),
    ]
    out = dedupe_completed_for_karte(rows)
    assert len(out) == 2
    assert out[0]["testId"] == "testA"
    assert out[0]["id"] == "s3"
    assert out[1]["testId"] == "testB"
