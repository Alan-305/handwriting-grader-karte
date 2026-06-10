import logging

from flask import Blueprint, g, jsonify, request

from app.services.grading_service import GradingService
from app.services.karte_service import KarteService
from app.services.session_service import SessionService
from app.utils.auth_decorator import require_auth

logger = logging.getLogger(__name__)

grading_bp = Blueprint("grading", __name__)


def _grading_error_response(exc: Exception, session_id: str, prior_status: str | None = None):
    message = str(exc)
    if prior_status is not None:
        try:
            GradingService().revert_grading_status(session_id, prior_status)
        except Exception:
            logger.exception("Failed to revert grading status for %s", session_id)
    if any(
        key in message
        for key in (
            "Anthropic",
            "添削AI",
            "JSON",
            "空の応答",
            "max_tokens",
            "API キー",
            "model",
            "API",
        )
    ):
        return jsonify({"error": message}), 502
    if isinstance(exc, ValueError):
        return jsonify({"error": message}), 400
    return jsonify(
        {"error": "添削中にエラーが発生しました。しばらくしてから再試行してください。"}
    ), 500


@grading_bp.post("/sessions/<session_id>/grade/begin")
@require_auth
def begin_grading(session_id: str):
    try:
        payload = GradingService().begin_grading(session_id, g.teacher_id)
        return jsonify(payload)
    except Exception as exc:
        logger.exception("Grading begin failed for session %s", session_id)
        return _grading_error_response(exc, session_id)


@grading_bp.post("/sessions/<session_id>/grade/step")
@require_auth
def grade_step(session_id: str):
    body = request.get_json(silent=True) or {}
    step_index = body.get("stepIndex")
    if step_index is None:
        return jsonify({"error": "stepIndex が必要です"}), 400
    try:
        step_index = int(step_index)
    except (TypeError, ValueError):
        return jsonify({"error": "stepIndex は整数で指定してください"}), 400

    service = GradingService()
    session = SessionService().get_session(session_id)
    prior_status = session.get("status") if session else None
    try:
        payload = service.grade_step(session_id, g.teacher_id, step_index)
        return jsonify(payload)
    except Exception as exc:
        logger.exception("Grading step %s failed for session %s", step_index, session_id)
        return _grading_error_response(exc, session_id, prior_status)


@grading_bp.post("/sessions/<session_id>/grade")
@require_auth
def grade_session(session_id: str):
    service = GradingService()
    session = SessionService().get_session(session_id)
    prior_status = session.get("status") if session else None
    try:
        payload = service.grade_session(session_id, g.teacher_id)
        return jsonify(payload)
    except Exception as exc:
        logger.exception("Grading failed for session %s", session_id)
        return _grading_error_response(exc, session_id, prior_status)


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


@grading_bp.post("/sessions/<session_id>/confirm-grading")
@require_auth
def confirm_grading(session_id: str):
    """教師が添削内容を確認・修正したあとに確定する。"""
    session_svc = SessionService()
    session = session_svc.get_session(session_id)
    if not session or session.get("teacherId") != g.teacher_id:
        return jsonify({"error": "セッションが見つかりません"}), 404

    if session.get("status") not in ("review", "completed"):
        return jsonify({"error": "添削確認の対象となるセッションではありません"}), 400

    session_svc.dedupe_question_results(session_id)
    results = session_svc.get_question_results(session_id)
    if not results or not all(r.get("graded") for r in results):
        return jsonify({"error": "未添削の設問があります"}), 400

    session_svc.confirm_grading(session_id)

    karte = KarteService()
    karte.update_aggregated_stats(session["studentId"], g.teacher_id)

    return jsonify({"status": "completed", "sessionId": session_id})


@grading_bp.post("/sessions/<session_id>/complete")
@require_auth
def complete_session(session_id: str):
    """後方互換: 確定と同義。"""
    return confirm_grading(session_id)
