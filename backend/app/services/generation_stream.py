"""問題生成の NDJSON ストリーム応答ヘルパー。"""

from __future__ import annotations

import json
import queue
import threading
from collections.abc import Callable
from typing import Any

from app.services.generation_progress import ProgressCallback


def progress_ndjson_line(event: dict) -> str:
    payload = {
        "type": "progress",
        "stage": event.get("stage", ""),
        "status": event.get("status", ""),
        "message": event.get("message", ""),
        "attempt": event.get("attempt"),
        "maxAttempts": event.get("max_attempts"),
        "issues": event.get("issues") or [],
        "provider": event.get("provider", ""),
    }
    return json.dumps(payload, ensure_ascii=False) + "\n"


def stream_draft_generation(
    *,
    start_message: str,
    run: Callable[[ProgressCallback], dict[str, Any]],
):
    """バックグラウンドスレッドで draft 生成し、進捗を NDJSON で yield するジェネレータ。"""

    event_queue: queue.SimpleQueue = queue.SimpleQueue()
    holder: dict[str, Any] = {}

    def on_progress(event: dict) -> None:
        event_queue.put(event)

    def worker() -> None:
        try:
            holder["draft"] = run(on_progress)
        except Exception as exc:
            holder["error"] = exc
        finally:
            event_queue.put(None)

    threading.Thread(target=worker, daemon=True).start()

    yield progress_ndjson_line(
        {
            "stage": "pipeline",
            "status": "start",
            "message": start_message,
        }
    )
    while True:
        item = event_queue.get()
        if item is None:
            break
        yield progress_ndjson_line(item)

    if holder.get("error"):
        err = holder["error"]
        yield json.dumps({"type": "error", "error": str(err)}, ensure_ascii=False) + "\n"
    else:
        yield json.dumps(
            {"type": "complete", "draft": holder["draft"]},
            ensure_ascii=False,
        ) + "\n"
