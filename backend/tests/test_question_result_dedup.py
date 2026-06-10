from datetime import datetime, timezone

from app.services.question_result_dedup import find_duplicate_ids, pick_best_duplicate


def test_pick_best_duplicate_prefers_graded():
    rows = [
        {"id": "a", "questionId": "q1", "partIndex": 0, "graded": False},
        {"id": "b", "questionId": "q1", "partIndex": 0, "graded": True},
    ]
    assert pick_best_duplicate(rows)["id"] == "b"


def test_pick_best_duplicate_prefers_newer_when_same_graded_state():
    older = datetime(2026, 1, 1, tzinfo=timezone.utc)
    newer = datetime(2026, 6, 1, tzinfo=timezone.utc)
    rows = [
        {"id": "old", "questionId": "q1", "partIndex": 4, "graded": True, "updatedAt": older},
        {"id": "new", "questionId": "q1", "partIndex": 4, "graded": True, "updatedAt": newer},
    ]
    assert pick_best_duplicate(rows)["id"] == "new"


def test_find_duplicate_ids_keeps_one_per_key():
    rows = [
        {"id": "q3p5a", "questionId": "q3", "partIndex": 4, "graded": True},
        {"id": "q3p5b", "questionId": "q3", "partIndex": 4, "graded": False},
        {"id": "q3p6a", "questionId": "q3", "partIndex": 5, "graded": True},
        {"id": "q3p6b", "questionId": "q3", "partIndex": 5, "graded": False},
        {"id": "q4", "questionId": "q4", "partIndex": 0, "graded": True},
    ]
    deleted = set(find_duplicate_ids(rows))
    assert deleted == {"q3p5b", "q3p6b"}
