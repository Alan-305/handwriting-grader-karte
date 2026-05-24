import logging

from flask import Blueprint, g, jsonify

from app.services.karte_service import KarteService
from app.utils.auth_decorator import require_auth

logger = logging.getLogger(__name__)

analysis_bp = Blueprint("analysis", __name__)


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
