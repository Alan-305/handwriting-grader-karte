import logging

from flask import Blueprint, g, jsonify, request

from app.services.session_service import SessionService
from app.services.transcription_service import TranscriptionService
from app.utils.auth_decorator import require_auth

logger = logging.getLogger(__name__)

transcription_bp = Blueprint("transcription", __name__)


@transcription_bp.post("/sessions/<session_id>/transcribe")
@require_auth
def transcribe_session(session_id: str):
    try:
        results = TranscriptionService().transcribe_session(session_id, g.teacher_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    except ValueError as exc:
        logger.warning("Transcription rejected for session %s: %s", session_id, exc)
        return jsonify({"error": str(exc)}), 502
    except Exception as exc:
        logger.exception("Transcription failed for session %s", session_id)
        message = str(exc)
        if "GEMINI" in message or "API" in message or "Gemini" in message:
            return jsonify({"error": message}), 502
        if "response.text" in message or "Part" in message:
            return jsonify(
                {
                    "error": (
                        "Gemini が答案画像の転記結果を返しませんでした。"
                        " 切り出し範囲・画像の鮮明さを確認して再試行してください。"
                    )
                }
            ), 502
        return jsonify({"error": "読み取り中にエラーが発生しました。"}), 500

    return jsonify({"sessionId": session_id, "results": results})


@transcription_bp.patch("/sessions/<session_id>/transcriptions")
@require_auth
def patch_transcriptions(session_id: str):
    session_svc = SessionService()
    session = session_svc.get_session(session_id)
    if not session or session.get("teacherId") != g.teacher_id:
        return jsonify({"error": "セッションが見つかりません"}), 404

    body = request.get_json(silent=True) or {}
    items = body.get("items") or []
    confirm_all = bool(body.get("confirmAll"))

    for item in items:
        result_id = item.get("id")
        if not result_id:
            continue
        patch: dict = {}
        if "studentAnswerText" in item:
            patch["studentAnswerText"] = item["studentAnswerText"]
        if item.get("transcriptionStatus") in ("pending_review", "confirmed"):
            patch["transcriptionStatus"] = item["transcriptionStatus"]
        if patch:
            session_svc.update_question_result(session_id, result_id, patch)

    if confirm_all:
        for row in session_svc.get_question_results(session_id):
            session_svc.update_question_result(
                session_id,
                row["id"],
                {"transcriptionStatus": "confirmed"},
            )

    results = session_svc.get_question_results(session_id)
    results.sort(key=lambda r: (r.get("order", 0), r.get("partIndex") or 0))
    return jsonify({"sessionId": session_id, "results": results})
