import logging
from datetime import datetime, timezone

from google.cloud.firestore import DELETE_FIELD

from app.services.firebase_admin_service import FirebaseAdminService
from app.services.karte_aggregation import session_activity_time

logger = logging.getLogger(__name__)

STATUS_FLOW = [
    "uploaded",
    "aligning",
    "aligned",
    "crop_review",
    "transcribing",
    "transcription_review",
    "grading",
    "review",
    "completed",
]


class SessionService:
    def __init__(self):
        self.firebase = FirebaseAdminService()

    def create_session(
        self,
        *,
        teacher_id: str,
        student_id: str,
        test_id: str,
        source_image_path: str,
        max_score: float,
    ) -> str:
        session_id = f"sess_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
        self.firebase.set_doc(
            "sessions",
            session_id,
            {
                "teacherId": teacher_id,
                "studentId": student_id,
                "testId": test_id,
                "status": "uploaded",
                "sessionDate": datetime.now(timezone.utc),
                "sourceImagePath": source_image_path,
                "totalScore": 0,
                "maxScore": max_score,
            },
        )
        return session_id

    def find_latest_session(
        self,
        *,
        teacher_id: str,
        student_id: str,
        test_id: str,
    ) -> str | None:
        """同一生徒・同一テストの最新セッション（再添削=上書き用）。"""
        sessions = self.firebase.query_collection("sessions", "studentId", "==", student_id)
        matches = [
            s
            for s in sessions
            if s.get("teacherId") == teacher_id and s.get("testId") == test_id
        ]
        if not matches:
            return None
        matches.sort(key=session_activity_time, reverse=True)
        return matches[0]["id"]

    def _clear_subcollection(self, session_id: str, name: str) -> None:
        db = self.firebase.db()
        if not db:
            return
        ref = db.collection("sessions").document(session_id).collection(name)
        for doc in ref.stream():
            doc.reference.delete()

    def reset_session_for_regrade(self, session_id: str, *, max_score: float) -> None:
        """同一テストの再添削: 既存セッションを初期化（sessionDate は維持）。"""
        self.clear_question_results(session_id)
        self._clear_subcollection(session_id, "print_artifacts")
        self.firebase.update_doc(
            "sessions",
            session_id,
            {
                "status": "uploaded",
                "totalScore": 0,
                "maxScore": max_score,
                "totalScore100": DELETE_FIELD,
                "gradingProgress": DELETE_FIELD,
                "gradingConfirmedAt": DELETE_FIELD,
                "completedAt": DELETE_FIELD,
                "studentPrintFinalizedAt": DELETE_FIELD,
                "alignedImagePath": DELETE_FIELD,
                "alignedImagePaths": DELETE_FIELD,
                "manualCrops": DELETE_FIELD,
                "pastExamAdvice": DELETE_FIELD,
                "pageCount": DELETE_FIELD,
            },
        )

    def update_status(self, session_id: str, status: str, **extra):
        data = {"status": status, **extra}
        self.firebase.update_doc("sessions", session_id, data)

    def update_progress(self, session_id: str, current: int, total: int, message: str = "添削中"):
        self.firebase.update_doc(
            "sessions",
            session_id,
            {"gradingProgress": {"current": current, "total": total, "message": message}},
        )

    def save_question_result(self, session_id: str, result: dict) -> str:
        result["createdAt"] = datetime.now(timezone.utc)
        return self.firebase.add_subdoc(["sessions", session_id, "question_results"], result)

    def clear_question_results(self, session_id: str) -> None:
        db = self.firebase.db()
        if not db:
            return
        ref = (
            db.collection("sessions")
            .document(session_id)
            .collection("question_results")
        )
        for doc in ref.stream():
            doc.reference.delete()

    def get_question_results(self, session_id: str) -> list[dict]:
        return self.firebase.get_subcollection(
            ["sessions", session_id, "question_results"]
        )

    def update_question_result(self, session_id: str, result_id: str, data: dict) -> None:
        db = self.firebase.db()
        if not db:
            return
        data["updatedAt"] = datetime.now(timezone.utc)
        (
            db.collection("sessions")
            .document(session_id)
            .collection("question_results")
            .document(result_id)
            .update(data)
        )

    def save_grading_scores(
        self,
        session_id: str,
        total_score: float,
        *,
        max_score: float | None = None,
        total_score_100: int | None = None,
        aligned_path: str | None = None,
    ):
        """AI添削直後: 教師確認待ち（completed にしない）。"""
        data = {
            "status": "review",
            "totalScore": total_score,
            "gradingProgress": None,
        }
        if max_score is not None:
            data["maxScore"] = max_score
        if total_score_100 is not None:
            data["totalScore100"] = total_score_100
        if aligned_path:
            data["alignedImagePath"] = aligned_path
        self.firebase.update_doc("sessions", session_id, data)

    def confirm_grading(self, session_id: str):
        """教師が添削内容を確定したあとに呼ぶ。"""
        now = datetime.now(timezone.utc)
        existing = self.get_session(session_id) or {}
        data: dict = {
            "status": "completed",
            "gradingConfirmedAt": now,
            "completedAt": now,
        }
        # orderBy("sessionDate") 一覧で除外されないよう、欠損時は確定日時で補完
        if not existing.get("sessionDate"):
            data["sessionDate"] = now
        self.firebase.update_doc("sessions", session_id, data)

    def complete_session(
        self,
        session_id: str,
        total_score: float,
        aligned_path: str | None = None,
        *,
        max_score: float | None = None,
        total_score_100: int | None = None,
    ):
        """後方互換: 即 completed にする旧動作。"""
        self.save_grading_scores(
            session_id,
            total_score,
            max_score=max_score,
            total_score_100=total_score_100,
            aligned_path=aligned_path,
        )
        self.confirm_grading(session_id)

    def get_session(self, session_id: str) -> dict | None:
        doc = self.firebase.get_doc("sessions", session_id)
        if doc:
            doc["id"] = session_id
        return doc

    def get_questions_for_test(self, test_id: str) -> list[dict]:
        db = self.firebase.db()
        if not db:
            return []
        docs = (
            db.collection("tests")
            .document(test_id)
            .collection("questions")
            .order_by("order")
            .stream()
        )
        results = []
        for doc in docs:
            item = doc.to_dict()
            item["id"] = doc.id
            results.append(item)
        return results

    def get_template(self, template_id: str) -> dict | None:
        doc = self.firebase.get_doc("answer_sheet_templates", template_id)
        if doc:
            doc["id"] = template_id
        return doc

    def get_test(self, test_id: str) -> dict | None:
        doc = self.firebase.get_doc("tests", test_id)
        if doc:
            doc["id"] = test_id
        return doc
