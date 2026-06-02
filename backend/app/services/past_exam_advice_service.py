import logging
from datetime import datetime, timezone

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.past_exam_advice import PAST_EXAM_ADVICE_SYSTEM, build_past_exam_advice_user_prompt
from app.ai.schemas.past_exam_advice import SessionPastExamAdviceResponse
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.past_exam_service import UNIVERSITY_REGISTRY, PastExamService
from app.services.question_design_service import QuestionDesignService
from app.services.university_context_service import UniversityContextService
from app.services.session_service import SessionService

logger = logging.getLogger(__name__)


class PastExamAdviceService:
    def __init__(self):
        self.firebase = FirebaseAdminService()
        self.session_service = SessionService()
        self.past_exam = PastExamService()
        self.question_design = QuestionDesignService()
        self.university_ctx = UniversityContextService()
        self.gemini = GeminiAnalysisClient()

    def _university_name(self, slug: str) -> str:
        return self.university_ctx.university_name(slug)

    def _get_student_name(self, student_id: str) -> str:
        doc = self.firebase.get_doc("students", student_id)
        return (doc or {}).get("name", "生徒")

    def _format_results_block(self, results: list[dict], questions: list[dict]) -> str:
        q_by_id = {q["id"]: q for q in questions}
        lines = []
        for r in sorted(results, key=lambda x: (x.get("order", 0), x.get("partIndex") or 0)):
            q = q_by_id.get(r.get("questionId"), {})
            label = f"第{r.get('order')}問"
            if r.get("partLabel"):
                label += f" {r['partLabel']}"
            lines.append(
                f"--- {label} ---\n"
                f"評価: {r.get('grade')} ({r.get('score')}/{r.get('maxPoints')}点)\n"
                f"問題文:\n{(q.get('prompt') or '')[:1500]}\n"
                f"生徒解答:\n{(r.get('studentAnswerText') or '')[:800]}\n"
                f"講評:\n{r.get('feedback', '')}\n"
                f"解説:\n{r.get('explanation', '')}\n"
                f"エラータグ: {', '.join(r.get('errorTags') or [])}\n"
            )
        return "\n".join(lines) or "（結果なし）"

    def generate_for_session(
        self,
        *,
        session_id: str,
        teacher_id: str,
        university_slug: str | None = None,
    ) -> dict:
        session = self.session_service.get_session(session_id)
        if not session:
            raise ValueError("セッションが見つかりません")
        if session.get("teacherId") != teacher_id:
            raise PermissionError("このセッションにアクセスする権限がありません")

        test_id = session.get("testId")
        if not test_id:
            raise ValueError("テスト情報がありません")

        test = self.session_service.get_test(test_id)
        if not test:
            raise ValueError("テストが見つかりません")

        student_doc = self.firebase.get_doc("students", session.get("studentId", ""))
        slug = self.university_ctx.resolve_university_slug(
            explicit_slug=university_slug or test.get("universitySlug"),
            student=student_doc,
        ) or "todai"
        questions = self.session_service.get_questions_for_test(test_id)
        results = self.firebase.get_subcollection(["sessions", session_id, "question_results"])
        if not results:
            raise ValueError("添削結果がありません。先に添削を完了してください。")

        past_questions = self.question_design._load_past_questions_for_years(
            teacher_id, slug, None
        )
        if not past_questions:
            raise ValueError("参照できる過去問がありません")

        context = self.question_design._build_reference_context(past_questions, limit=14)
        years = sorted({int(q.get("year") or 0) for q in past_questions if q.get("year")}, reverse=True)
        materials = self.question_design._load_teacher_materials_snippet(teacher_id, slug, years)

        total = session.get("totalScore", 0)
        max_score = session.get("maxScore", 0)
        score_line = f"{total} / {max_score}点"
        if session.get("totalScore100") is not None:
            score_line += f"（100点換算 {session['totalScore100']}点）"

        user_prompt = build_past_exam_advice_user_prompt(
            student_name=self._get_student_name(session.get("studentId", "")),
            university_name=self._university_name(slug),
            university_slug=slug,
            test_title=test.get("title", ""),
            session_score_line=score_line,
            question_results_block=self._format_results_block(results, questions),
            past_questions_context=context,
            teacher_materials_context=materials,
        )

        advice: SessionPastExamAdviceResponse = self.gemini.complete_structured(
            system=PAST_EXAM_ADVICE_SYSTEM,
            user_text=user_prompt,
            response_schema=SessionPastExamAdviceResponse,
        )

        payload = advice.model_dump(by_alias=True)
        now = datetime.now(timezone.utc)
        payload["generatedAt"] = now.isoformat()

        self.firebase.update_doc(
            "sessions",
            session_id,
            {"pastExamAdvice": payload, "updatedAt": now},
        )
        return payload

    def get_cached_advice(self, session_id: str, teacher_id: str) -> dict | None:
        session = self.session_service.get_session(session_id)
        if not session or session.get("teacherId") != teacher_id:
            return None
        return session.get("pastExamAdvice")
