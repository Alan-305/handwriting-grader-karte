import logging
from collections import Counter
from datetime import datetime, timezone

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.karte_advice import KARTE_SYSTEM, build_karte_user_prompt
from app.ai.schemas.grading import KarteAdviceResponse
from app.services.error_tags import categorize_error_tag
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.karte_aggregation import dedupe_completed_for_karte
from app.services.session_service import SessionService

logger = logging.getLogger(__name__)


class KarteService:
    def __init__(self):
        self.firebase = FirebaseAdminService()
        self.session_service = SessionService()
        self.gemini = GeminiAnalysisClient()

    def _error_tags_for_session(self, db, session_id: str) -> dict[str, int]:
        counter: Counter = Counter()
        for r in (
            db.collection("sessions")
            .document(session_id)
            .collection("question_results")
            .stream()
        ):
            data = r.to_dict() or {}
            for tag in data.get("errorTags") or []:
                if isinstance(tag, str) and tag.strip():
                    counter[categorize_error_tag(tag.strip())] += 1
        return dict(counter)

    def aggregate_generalized_error_tags(self, student_id: str, teacher_id: str) -> dict[str, int]:
        """第1回〜最新回まで、添削完了テスト（同一testIdは最新のみ）のエラーを一般化カテゴリで累積。"""
        sessions = self.firebase.query_collection("sessions", "studentId", "==", student_id)
        sessions = [s for s in sessions if s.get("teacherId") == teacher_id]
        completed = dedupe_completed_for_karte(sessions)
        counter: Counter = Counter()
        db = self.firebase.db()
        if not db:
            return {}
        for sess in completed:
            for cat, count in self._error_tags_for_session(db, sess["id"]).items():
                counter[cat] += count
        return dict(counter)

    def aggregate_error_tags_by_session(
        self, student_id: str, teacher_id: str
    ) -> list[dict]:
        """時系列順に、テストごとの一般化ミス傾向（第1回が先頭）。"""
        sessions = self.firebase.query_collection("sessions", "studentId", "==", student_id)
        sessions = [s for s in sessions if s.get("teacherId") == teacher_id]
        completed = dedupe_completed_for_karte(sessions)
        db = self.firebase.db()
        if not db:
            return []
        blocks: list[dict] = []
        for order, sess in enumerate(completed, start=1):
            freq = self._error_tags_for_session(db, sess["id"])
            tags = sorted(freq.items(), key=lambda x: (-x[1], x[0]))
            blocks.append(
                {
                    "order": order,
                    "sessionId": sess["id"],
                    "tags": [{"tag": t, "count": c} for t, c in tags],
                }
            )
        return blocks

    def build_session_summaries(self, student_id: str, teacher_id: str) -> tuple[str, list[str]]:
        sessions = self.firebase.query_collection("sessions", "studentId", "==", student_id)
        sessions = [s for s in sessions if s.get("teacherId") == teacher_id]
        completed = dedupe_completed_for_karte(sessions)
        lines = []
        session_ids = []
        db = self.firebase.db()
        for sess in completed:
            sid = sess["id"]
            session_ids.append(sid)
            score = sess.get("totalScore", 0)
            max_score = sess.get("maxScore", 0)
            line = f"Session {sid}: {score}/{max_score}点"
            if db:
                results = db.collection("sessions").document(sid).collection("question_results").stream()
                grades = [r.to_dict().get("grade", "?") for r in results]
                line += f" 評価:{','.join(grades)}"
            lines.append(line)
        return "\n".join(lines) or "セッション履歴なし", session_ids

    def update_aggregated_stats(self, student_id: str, teacher_id: str):
        sessions = self.firebase.query_collection("sessions", "studentId", "==", student_id)
        sessions = [s for s in sessions if s.get("teacherId") == teacher_id]
        completed = dedupe_completed_for_karte(sessions)
        score_history = [
            {
                "sessionId": s["id"],
                "date": s.get("sessionDate"),
                "totalScore": s.get("totalScore", 0),
                "maxScore": s.get("maxScore", 0),
            }
            for s in completed
        ]
        error_freq = self.aggregate_generalized_error_tags(student_id, teacher_id)
        top_errors = sorted(error_freq.items(), key=lambda x: (-x[1], x[0]))[:12]
        error_by_session = self.aggregate_error_tags_by_session(student_id, teacher_id)

        db = self.firebase.db()

        type_acc = {"english": [], "japanese": [], "symbol": []}
        if db:
            for sess in completed:
                results = (
                    db.collection("sessions")
                    .document(sess["id"])
                    .collection("question_results")
                    .stream()
                )
                for r in results:
                    data = r.to_dict()
                    qtype = data.get("type", "english")
                    max_pts = data.get("maxPoints", 1) or 1
                    acc = (data.get("score", 0) / max_pts) * 100
                    if qtype in type_acc:
                        type_acc[qtype].append(acc)

        stats = {
            "totalSessions": len(completed),
            "scoreHistory": score_history,
            "questionTypeAccuracy": type_acc,
            "topErrorTags": [{"tag": t, "count": c} for t, c in top_errors],
            "errorTagsBySession": error_by_session,
            "lastUpdated": datetime.now(timezone.utc),
        }
        self.firebase.set_doc("students", student_id, {}, merge=True)
        if db:
            db.collection("students").document(student_id).collection("stats").document("aggregated").set(stats)

    def analyze_student(self, student_id: str, teacher_id: str) -> dict:
        student = self.firebase.get_doc("students", student_id) or {}
        if student.get("teacherId") != teacher_id:
            raise PermissionError("Access denied")

        error_stats = self.aggregate_generalized_error_tags(student_id, teacher_id)
        summaries, session_ids = self.build_session_summaries(student_id, teacher_id)

        interview = student.get("interviewProfile") or {}
        interview_records = self.firebase.get_subcollection(
            ["students", student_id, "interview_records"]
        )
        interview_records.sort(key=lambda r: r.get("recordNumber") or 0)

        target_refs = interview.get("targetUniversities") or student.get("targetUniversities", [])
        if not target_refs and interview_records:
            target_refs = interview_records[-1].get("targetUniversities", [])

        target_unis = []
        for tu in target_refs:
            uni = self.firebase.get_doc("target_universities", tu.get("universityId", ""))
            if uni:
                merged = {**uni, "priority": tu.get("priority", 1)}
                target_unis.append(merged)
            else:
                target_unis.append(tu)

        prompt = build_karte_user_prompt(
            student_name=student.get("name", ""),
            course="",
            target_universities=target_unis,
            session_summaries=summaries,
            error_stats=error_stats,
            interview_profile=interview or None,
            interview_records=interview_records or None,
        )

        result: KarteAdviceResponse = self.gemini.complete_structured(
            system=KARTE_SYSTEM,
            user_text=prompt,
            response_schema=KarteAdviceResponse,
        )

        snapshot = {
            "generatedAt": datetime.now(timezone.utc),
            "sessionIdsIncluded": session_ids,
            "sessionCount": len(session_ids),
            "weaknessSummary": result.weakness_summary,
            "errorFrequency": result.error_frequency or error_stats,
            "adviceCards": [c.model_dump() for c in result.advice_cards],
            "readinessComment": result.readiness_comment,
            "geminiModel": "gemini",
        }

        snapshot_id = self.firebase.add_subdoc(["students", student_id, "karte_snapshots"], snapshot)
        self.update_aggregated_stats(student_id, teacher_id)
        snapshot["id"] = snapshot_id
        return snapshot
