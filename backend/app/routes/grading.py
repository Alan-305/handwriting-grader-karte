import logging

from flask import Blueprint, g, jsonify

from app.ai.anthropic_client import AnthropicVisionClient
from app.ai.schemas.grading import GradeResult
from app.services.answer_parts import crop_filename, iter_crop_targets
from app.services.grading_prompt import build_user_prompt, select_grading_prompts
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.karte_service import KarteService
from app.services.scoring import clamp_score, to_score_out_of_100
from app.services.session_service import SessionService
from app.utils.auth_decorator import require_auth
from app.utils.image_encoding import image_to_base64

logger = logging.getLogger(__name__)

grading_bp = Blueprint("grading", __name__)


@grading_bp.post("/sessions/<session_id>/grade")
@require_auth
def grade_session(session_id: str):
    session_svc = SessionService()
    session = session_svc.get_session(session_id)
    if not session or session.get("teacherId") != g.teacher_id:
        return jsonify({"error": "セッションが見つかりません"}), 404

    session_svc.update_status(session_id, "grading")
    questions = session_svc.get_questions_for_test(session["testId"])
    targets = iter_crop_targets(questions)
    firebase = FirebaseAdminService()
    client = AnthropicVisionClient()

    total_score = 0.0
    max_score = 0.0
    results = []

    for i, target in enumerate(targets):
        session_svc.update_progress(session_id, i, len(targets), "添削中")

        q = next(q for q in questions if q["id"] == target["questionId"])
        parts = q.get("answerParts") or []
        has_parts = len(parts) > 0
        filename = crop_filename(target["order"], target["partIndex"], has_parts)
        crop_path = f"teachers/{g.teacher_id}/sessions/{session_id}/crops/{filename}"
        crop_bytes = firebase.download_bytes(crop_path)
        if not crop_bytes:
            continue

        b64, media_type = image_to_base64(crop_bytes)
        system, prompt_fn = select_grading_prompts(target)
        user_text = build_user_prompt(target, prompt_fn)

        grade: GradeResult = client.complete_structured(
            system=system,
            user_text=user_text,
            response_schema=GradeResult,
            image_base64=b64,
            media_type=media_type,
        )

        max_points = float(target.get("points", grade.max_points))
        score = clamp_score(grade.score, max_points)
        total_score += score
        max_score += max_points

        result_data = {
            "questionId": target["questionId"],
            "order": target["order"],
            "partIndex": target["partIndex"],
            "partLabel": target.get("partLabel"),
            "type": target["type"],
            "croppedImagePath": crop_path,
            "grade": grade.grade,
            "score": score,
            "maxPoints": max_points,
            "studentAnswerText": grade.student_answer_text,
            "feedback": grade.feedback,
            "explanation": grade.explanation,
            "modelAnswer": target.get("modelAnswer", ""),
            "errorTags": grade.error_tags,
            "teacherNotes": grade.teacher_notes,
        }
        result_id = session_svc.save_question_result(session_id, result_data)
        result_data["id"] = result_id
        results.append(result_data)

    total_score_100 = to_score_out_of_100(total_score, max_score)

    session_svc.complete_session(
        session_id,
        total_score,
        session.get("alignedImagePath"),
        max_score=max_score,
        total_score_100=total_score_100,
    )
    session_svc.update_status(session_id, "review")

    karte = KarteService()
    karte.update_aggregated_stats(session["studentId"], g.teacher_id)

    return jsonify(
        {
            "sessionId": session_id,
            "totalScore": total_score,
            "maxScore": max_score,
            "totalScore100": total_score_100,
            "results": results,
        }
    )


@grading_bp.get("/sessions/<session_id>/progress")
@require_auth
def session_progress(session_id: str):
    session_svc = SessionService()
    session = session_svc.get_session(session_id)
    if not session or session.get("teacherId") != g.teacher_id:
        return jsonify({"error": "セッションが見つかりません"}), 404

    return jsonify(
        {
            "status": session.get("status"),
            "gradingProgress": session.get("gradingProgress"),
            "totalScore": session.get("totalScore"),
        }
    )


@grading_bp.post("/sessions/<session_id>/complete")
@require_auth
def complete_session(session_id: str):
    session_svc = SessionService()
    session = session_svc.get_session(session_id)
    if not session or session.get("teacherId") != g.teacher_id:
        return jsonify({"error": "セッションが見つかりません"}), 404

    session_svc.update_status(session_id, "completed")
    return jsonify({"status": "completed"})
