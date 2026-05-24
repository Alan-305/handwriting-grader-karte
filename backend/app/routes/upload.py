import logging

from flask import Blueprint, g, jsonify, request

from app.services.firebase_admin_service import FirebaseAdminService
from app.services.session_service import SessionService
from app.utils.auth_decorator import require_auth

logger = logging.getLogger(__name__)

upload_bp = Blueprint("upload", __name__)


@upload_bp.post("/sessions/upload")
@require_auth
def upload_session():
    if "image" not in request.files:
        return jsonify({"error": "画像ファイルが必要です"}), 400

    student_id = request.form.get("studentId")
    test_id = request.form.get("testId")
    if not student_id or not test_id:
        return jsonify({"error": "studentId と testId が必要です"}), 400

    image_file = request.files["image"]
    image_bytes = image_file.read()

    session_svc = SessionService()
    test = session_svc.get_test(test_id)
    if not test or test.get("teacherId") != g.teacher_id:
        return jsonify({"error": "テストが見つかりません"}), 404

    session_id = session_svc.create_session(
        teacher_id=g.teacher_id,
        student_id=student_id,
        test_id=test_id,
        source_image_path="",
        max_score=test.get("totalPoints", 0),
    )

    path = f"teachers/{g.teacher_id}/sessions/{session_id}/source.jpg"
    firebase = FirebaseAdminService()
    firebase.upload_bytes(path, image_bytes)
    session_svc.update_status(session_id, "uploaded", sourceImagePath=path)

    return jsonify({"sessionId": session_id, "sourceImagePath": path}), 201
