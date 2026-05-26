import logging

from flask import Blueprint, g, jsonify, request
from pydantic import BaseModel, Field, ValidationError

from app.services.karte_service import KarteService
from app.services.past_exam_advice_service import PastExamAdviceService
from app.utils.auth_decorator import require_auth

logger = logging.getLogger(__name__)

analysis_bp = Blueprint("analysis", __name__)


class PastExamAdviceBody(BaseModel):
    university_slug: str | None = Field(alias="universitySlug", default=None)

    model_config = {"populate_by_name": True}


@analysis_bp.get("/sessions/<session_id>/past-exam-advice")
@require_auth
def get_past_exam_advice(session_id: str):
    service = PastExamAdviceService()
    advice = service.get_cached_advice(session_id, g.teacher_id)
    return jsonify({"advice": advice})


@analysis_bp.post("/sessions/<session_id>/past-exam-advice")
@require_auth
def generate_past_exam_advice(session_id: str):
    try:
        body = PastExamAdviceBody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = PastExamAdviceService()
    try:
        advice = service.generate_for_session(
            session_id=session_id,
            teacher_id=g.teacher_id,
            university_slug=body.university_slug,
        )
        return jsonify({"advice": advice})
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@analysis_bp.post("/students/<student_id>/analyze")
@require_auth
def analyze_student(student_id: str):
    try:
        karte = KarteService()
        snapshot = karte.analyze_student(student_id, g.teacher_id)
        return jsonify(snapshot)
    except PermissionError:
        return jsonify({"error": "アクセス権がありません"}), 403
    except Exception as exc:
        logger.exception("Analysis failed for student %s", student_id)
        return jsonify({"error": str(exc)}), 500


@analysis_bp.post("/students/<student_id>/stats/refresh")
@require_auth
def refresh_stats(student_id: str):
    karte = KarteService()
    karte.update_aggregated_stats(student_id, g.teacher_id)
    return jsonify({"status": "ok"})
