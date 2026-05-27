"""カルテ用セッション集計（同一テストの再添削は上書き扱い）。"""

from __future__ import annotations

from datetime import datetime, timezone


def _coerce_datetime(value: object) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    ts = getattr(value, "timestamp", None)
    if callable(ts):
        return datetime.fromtimestamp(ts(), tz=timezone.utc)
    return datetime.min.replace(tzinfo=timezone.utc)


def session_activity_time(session: dict) -> datetime:
    """確定・完了・実施日のうち最も新しい時刻（再添削判定用）。"""
    best = datetime.min.replace(tzinfo=timezone.utc)
    for key in ("gradingConfirmedAt", "completedAt", "sessionDate", "updatedAt"):
        candidate = _coerce_datetime(session.get(key))
        if candidate > best:
            best = candidate
    return best


def session_test_id(session: dict) -> str:
    return str(session.get("testId") or session.get("id") or "")


def dedupe_completed_for_karte(all_sessions: list[dict]) -> list[dict]:
    """
    同一 testId の完了セッションは最新1件だけ残す。
    並び順はそのテストの「初回実施日」(sessionDate の最小) 昇順。
    """
    if not all_sessions:
        return []

    first_seen: dict[str, datetime] = {}
    for session in all_sessions:
        tid = session_test_id(session)
        if not tid:
            continue
        seen = _coerce_datetime(session.get("sessionDate"))
        if tid not in first_seen or seen < first_seen[tid]:
            first_seen[tid] = seen

    latest_by_test: dict[str, dict] = {}
    for session in all_sessions:
        if session.get("status") != "completed":
            continue
        tid = session_test_id(session)
        if not tid:
            continue
        current = latest_by_test.get(tid)
        if not current or session_activity_time(session) >= session_activity_time(current):
            latest_by_test[tid] = session

    deduped = list(latest_by_test.values())
    deduped.sort(
        key=lambda s: first_seen.get(session_test_id(s), session_activity_time(s)),
    )
    return deduped
