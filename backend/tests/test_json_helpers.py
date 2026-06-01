from datetime import datetime, timezone

from app.utils.json_helpers import to_json_safe


def test_to_json_safe_converts_datetime():
    dt = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
    out = to_json_safe({"generatedAt": dt, "nested": {"items": [dt]}})
    assert out["generatedAt"] == "2026-06-01T12:00:00+00:00"
    assert out["nested"]["items"][0] == "2026-06-01T12:00:00+00:00"
