"""過去問アドバイス生成時に参照する、前回以前のセッションアドバイス。"""

from __future__ import annotations

from app.services.karte_aggregation import session_activity_time


def _advice_university_slug(advice: dict) -> str:
    return str(advice.get("universitySlug") or "").strip()


def pick_previous_advice_sessions(
    all_sessions: list[dict],
    *,
    current_session_id: str,
    teacher_id: str,
    university_slug: str | None = None,
    limit: int = 1,
) -> list[dict]:
    """
    同一生徒の、現在セッションより前に生成済みの pastExamAdvice を持つセッションを返す。
    同一志望校 slug を優先し、なければ他大学 slug も含めて最新順。
    """
    candidates: list[dict] = []
    for session in all_sessions:
        if session.get("teacherId") != teacher_id:
            continue
        sid = session.get("id")
        if not sid or sid == current_session_id:
            continue
        advice = session.get("pastExamAdvice")
        if not isinstance(advice, dict) or not advice.get("overallSummary"):
            continue
        candidates.append(session)

    if not candidates:
        return []

    slug = (university_slug or "").strip()
    same_slug = [s for s in candidates if _advice_university_slug(s["pastExamAdvice"]) == slug]
    pool = same_slug if slug and same_slug else candidates
    pool.sort(key=session_activity_time, reverse=True)
    return pool[: max(1, limit)]


def format_previous_advice_block(
    entries: list[tuple[dict, dict, str]],
    *,
    max_chars: int = 3500,
) -> str:
    """
    entries: (session_doc, pastExamAdvice, test_title) の新しい順リスト。
    """
    if not entries:
        return ""

    parts: list[str] = [
        "【前回以前の過去問アドバイス（必ず踏まえる。今回の添削との変化・継続課題を書く）】",
    ]
    for index, (session, advice, test_title) in enumerate(entries):
        label = "前回" if index == 0 else f"その前（-{index}）"
        when = session.get("sessionDate")
        when_str = str(when)[:10] if when else "日付不明"
        title = (test_title or "テスト").strip()
        parts.append(f"\n--- {label}: {title}（{when_str}） ---")
        parts.append(f"総評: {advice.get('overallSummary', '')}")
        readiness = advice.get("readinessVsExam", "")
        if readiness:
            parts.append(f"準備度: {readiness}")

        points = advice.get("teacherTalkingPoints") or []
        if points:
            parts.append("面談要点: " + " / ".join(str(p) for p in points[:5]))

        for ins in advice.get("questionInsights") or []:
            order = ins.get("questionOrder", "?")
            parts.append(
                f"第{order}問 [{ins.get('matchedTypeLabel', '')}]: "
                f"出来={ins.get('performanceSummary', '')[:200]} | "
                f"過去問={ins.get('pastExamConnection', '')[:200]} | "
                f"次の一手={ins.get('studyAction', '')[:200]}"
            )

        cards = advice.get("adviceCards") or []
        if cards:
            card_lines = [
                f"・{c.get('title', '')}: {(c.get('body') or '')[:120]}"
                for c in cards[:4]
            ]
            parts.append("アドバイスカード: " + " ".join(card_lines))

    text = "\n".join(parts).strip()
    if len(text) > max_chars:
        return text[: max_chars - 20].rstrip() + "\n…（省略）"
    return text
