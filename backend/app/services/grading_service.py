import logging

from google.cloud.firestore import DELETE_FIELD

from app.ai.anthropic_client import AnthropicVisionClient
from app.ai.schemas.grading import GradeResult
from app.services.answer_parts import iter_crop_targets
from app.services.grading_prompt import (
    build_text_user_prompt,
    grading_response_schema,
    select_grading_prompts,
)
from app.services.scoring import clamp_score, to_score_out_of_100
from app.services.session_service import SessionService
from app.services.university_context_service import UniversityContextService

logger = logging.getLogger(__name__)

TEACHER_PRIORITY_FIELDS = (
    "grade",
    "score",
    "feedback",
    "explanation",
    "contentEvaluation",
    "grammarEvaluation",
    "polishedAnswer",
    "modelAnswer",
    "teacherNotes",
    "errorTags",
)


def _result_key(result: dict) -> tuple:
    return (result.get("questionId"), result.get("partIndex"))


def build_preserved_grade_update(
    *,
    stored: dict,
    target: dict,
    student_text: str,
) -> dict:
    """教師確認画面で保存済みの採点・解説を維持したまま再採点する。"""
    max_points = float(target.get("points", stored.get("maxPoints", 10)))
    score = clamp_score(float(stored.get("score") or 0), max_points)
    update_data: dict = {
        "grade": stored.get("grade"),
        "score": score,
        "maxPoints": max_points,
        "studentAnswerText": student_text,
        "feedback": stored.get("feedback", ""),
        "explanation": stored.get("explanation", ""),
        "modelAnswer": stored.get("modelAnswer", target.get("modelAnswer", "")),
        "errorTags": stored.get("errorTags") or [],
        "teacherNotes": stored.get("teacherNotes", ""),
        "transcriptionStatus": "confirmed",
        "graded": True,
        "teacherReviewed": bool(stored.get("teacherReviewed")),
    }
    content_eval = stored.get("contentEvaluation")
    grammar_eval = stored.get("grammarEvaluation")
    polished = stored.get("polishedAnswer")
    update_data["contentEvaluation"] = content_eval if content_eval else DELETE_FIELD
    update_data["grammarEvaluation"] = grammar_eval if grammar_eval else DELETE_FIELD
    update_data["polishedAnswer"] = polished if polished else DELETE_FIELD
    return update_data


def apply_teacher_priority(stored: dict, update_data: dict) -> dict:
    """AI 採点結果に、教師が保存済みのフィールドを上書きして反映する。"""
    merged = dict(update_data)
    for field in TEACHER_PRIORITY_FIELDS:
        if field not in stored:
            continue
        value = stored[field]
        if field in ("feedback", "explanation", "contentEvaluation", "grammarEvaluation", "polishedAnswer", "teacherNotes"):
            if value is None:
                continue
        elif field == "errorTags":
            if value is None:
                continue
        elif field == "score":
            if stored.get("score") is None:
                continue
            merged["score"] = clamp_score(float(stored["score"]), float(merged.get("maxPoints") or stored.get("maxPoints") or 0))
            continue
        elif field == "grade":
            if not value:
                continue
        merged[field] = value
    if stored.get("teacherReviewed"):
        merged["teacherReviewed"] = True
    return merged


class GradingService:
    def __init__(self):
        self.session_svc = SessionService()
        self.uni_ctx = UniversityContextService()
        self.client = AnthropicVisionClient()

    def _load_grading_context(
        self, session_id: str, teacher_id: str
    ) -> tuple[dict, list[dict], list[dict], dict, str | None, str]:
        session = self.session_svc.get_session(session_id)
        if not session or session.get("teacherId") != teacher_id:
            raise ValueError("セッションが見つかりません")

        self.session_svc.dedupe_question_results(session_id)
        existing = self.session_svc.get_question_results(session_id)
        if not existing:
            raise ValueError("転記結果がありません。先に読み取りを実行してください。")

        unconfirmed = [
            r for r in existing if r.get("transcriptionStatus") != "confirmed"
        ]
        if unconfirmed:
            raise ValueError(
                "転記が未確定の設問があります。確認画面で内容を確定してください。"
            )

        student_doc = self.session_svc.firebase.get_doc(
            "students", session.get("studentId", "")
        )
        student_name = (student_doc or {}).get("name", "") or ""
        test_doc = self.session_svc.get_test(session["testId"]) or {}
        uni_slug = self.uni_ctx.resolve_university_slug(
            explicit_slug=test_doc.get("universitySlug"),
            student=student_doc,
        )
        questions = self.session_svc.get_questions_for_test(session["testId"])
        targets = iter_crop_targets(questions)
        by_key = {_result_key(r): r for r in existing}
        return session, targets, questions, by_key, uni_slug, student_name

    def begin_grading(self, session_id: str, teacher_id: str) -> dict:
        session, targets, _, _, _, _ = self._load_grading_context(session_id, teacher_id)
        self.session_svc.update_status(session_id, "grading")
        return {
            "sessionId": session_id,
            "total": len(targets),
            "priorStatus": session.get("status"),
        }

    def grade_step(
        self,
        session_id: str,
        teacher_id: str,
        step_index: int,
        *,
        teacher_id_for_context: str | None = None,
        preserve_teacher_edits: bool = False,
    ) -> dict:
        tid = teacher_id_for_context or teacher_id
        session, targets, _, by_key, uni_slug, student_name = self._load_grading_context(
            session_id, teacher_id
        )
        if step_index < 0 or step_index >= len(targets):
            raise ValueError(f"設問インデックスが不正です: {step_index}")

        target = targets[step_index]
        label = target.get("partLabel") or f"第{target.get('order')}問"
        self.session_svc.update_progress(
            session_id, step_index, len(targets), f"{label}を添削中"
        )

        stored = by_key.get(_result_key(target))
        if not stored:
            raise ValueError(f"{label}の転記結果が見つかりません")

        student_text = (stored.get("studentAnswerText") or "").strip()
        if not student_text:
            raise ValueError(
                f"第{target.get('order')}問の転記が空です。確認画面で入力してください。"
            )

        if preserve_teacher_edits and stored.get("graded"):
            update_data = build_preserved_grade_update(
                stored=stored,
                target=target,
                student_text=student_text,
            )
            self.session_svc.update_question_result(session_id, stored["id"], update_data)
            result_data = {
                k: v for k, v in update_data.items() if v is not DELETE_FIELD
            }
            result_data["id"] = stored["id"]
            result_data["questionId"] = stored.get("questionId")
            result_data["order"] = stored.get("order")
            result_data["partLabel"] = stored.get("partLabel")
            return self._finalize_step_payload(
                session_id=session_id,
                session=session,
                step_index=step_index,
                targets=targets,
                result_data=result_data,
            )

        system, _prompt_fn = select_grading_prompts(target)
        uni_block = ""
        if uni_slug:
            uni_block = self.uni_ctx.build_grading_context_block(
                tid,
                uni_slug,
                major_order=int(target.get("order") or 0) or None,
            )
        user_text = build_text_user_prompt(
            target,
            student_text,
            student_name=student_name,
            university_context=uni_block,
        )
        schema = grading_response_schema(target)

        grade: GradeResult = self.client.complete_structured(
            system=system,
            user_text=user_text,
            response_schema=schema,
        )

        max_points = float(target.get("points", grade.max_points))
        score = clamp_score(grade.score, max_points)

        update_data = {
            "grade": grade.grade,
            "score": score,
            "maxPoints": max_points,
            "studentAnswerText": student_text,
            "feedback": grade.feedback,
            "explanation": grade.explanation,
            "modelAnswer": target.get("modelAnswer", stored.get("modelAnswer", "")),
            "errorTags": grade.error_tags,
            "teacherNotes": grade.teacher_notes,
            "transcriptionStatus": "confirmed",
            "graded": True,
            "teacherReviewed": False,
        }
        content_eval = getattr(grade, "content_evaluation", None)
        grammar_eval = getattr(grade, "grammar_evaluation", None)
        polished = getattr(grade, "polished_answer", None)
        update_data["contentEvaluation"] = content_eval if content_eval else DELETE_FIELD
        update_data["grammarEvaluation"] = grammar_eval if grammar_eval else DELETE_FIELD
        update_data["polishedAnswer"] = polished if polished else DELETE_FIELD
        if preserve_teacher_edits:
            update_data = apply_teacher_priority(stored, update_data)
        self.session_svc.update_question_result(session_id, stored["id"], update_data)

        result_data = {
            k: v for k, v in update_data.items() if v is not DELETE_FIELD
        }
        result_data["id"] = stored["id"]
        result_data["questionId"] = stored.get("questionId")
        result_data["order"] = stored.get("order")
        result_data["partLabel"] = stored.get("partLabel")
        return self._finalize_step_payload(
            session_id=session_id,
            session=session,
            step_index=step_index,
            targets=targets,
            result_data=result_data,
        )

    def _finalize_step_payload(
        self,
        *,
        session_id: str,
        session: dict,
        step_index: int,
        targets: list[dict],
        result_data: dict,
    ) -> dict:
        done = step_index >= len(targets) - 1
        payload: dict = {
            "sessionId": session_id,
            "stepIndex": step_index,
            "total": len(targets),
            "done": done,
            "result": result_data,
        }

        if done:
            results = self.session_svc.get_question_results(session_id)
            total_score = sum(float(r.get("score") or 0) for r in results if r.get("graded"))
            max_score = sum(float(r.get("maxPoints") or 0) for r in results if r.get("graded"))
            total_score_100 = to_score_out_of_100(total_score, max_score)
            self.session_svc.save_grading_scores(
                session_id,
                total_score,
                max_score=max_score,
                total_score_100=total_score_100,
                aligned_path=session.get("alignedImagePath"),
            )
            payload.update(
                {
                    "totalScore": total_score,
                    "maxScore": max_score,
                    "totalScore100": total_score_100,
                }
            )
        return payload

    def grade_session(
        self,
        session_id: str,
        teacher_id: str,
        *,
        preserve_teacher_edits: bool = False,
    ) -> dict:
        begin = self.begin_grading(session_id, teacher_id)
        total = begin["total"]
        last_payload: dict = {}
        for i in range(total):
            last_payload = self.grade_step(
                session_id,
                teacher_id,
                i,
                preserve_teacher_edits=preserve_teacher_edits,
            )
        results = self.session_svc.get_question_results(session_id)
        return {
            "sessionId": session_id,
            "totalScore": last_payload.get("totalScore", 0),
            "maxScore": last_payload.get("maxScore", 0),
            "totalScore100": last_payload.get("totalScore100", 0),
            "results": results,
        }

    def revert_grading_status(self, session_id: str, prior_status: str | None) -> None:
        revert_status = "review" if prior_status == "review" else "transcription_review"
        self.session_svc.update_status(session_id, revert_status, gradingProgress=None)
