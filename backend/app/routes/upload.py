import logging

from flask import Blueprint, g, jsonify, request

from app.services.answer_sheet_upload import expand_upload_files_to_jpeg_pages
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.session_service import SessionService
from app.utils.auth_decorator import require_auth

logger = logging.getLogger(__name__)

upload_bp = Blueprint("upload", __name__)


def _collect_upload_files() -> list:
    files = request.files.getlist("images")
    if not files:
        single = request.files.get("image")
        if single and single.filename:
            files = [single]
    return [f for f in files if f and f.filename]


@upload_bp.post("/sessions/upload")
@require_auth
def upload_session():
    upload_files = _collect_upload_files()
    if not upload_files:
        return jsonify({"error": "写真または PDF を1件以上アップロードしてください"}), 400

    try:
        page_images = expand_upload_files_to_jpeg_pages(upload_files)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    student_id = request.form.get("studentId")
    test_id = request.form.get("testId")
    if not student_id or not test_id:
        return jsonify({"error": "studentId と testId が必要です"}), 400

    session_svc = SessionService()
    test = session_svc.get_test(test_id)
    if not test or test.get("teacherId") != g.teacher_id:
        return jsonify({"error": "テストが見つかりません"}), 404

    session_id = session_svc.find_latest_session(
        teacher_id=g.teacher_id,
        student_id=student_id,
        test_id=test_id,
    )
    if session_id:
        session_svc.reset_session_for_regrade(
            session_id,
            max_score=test.get("totalPoints", 0),
        )
        logger.info(
            "Reusing session %s for student=%s test=%s (overwrite regrade)",
            session_id,
            student_id,
            test_id,
        )
    else:
        session_id = session_svc.create_session(
            teacher_id=g.teacher_id,
            student_id=student_id,
            test_id=test_id,
            source_image_path="",
            max_score=test.get("totalPoints", 0),
        )

    firebase = FirebaseAdminService()
    source_paths: list[str] = []
    for index, image_bytes in enumerate(page_images):
        path = f"teachers/{g.teacher_id}/sessions/{session_id}/source_p{index + 1}.jpg"
        firebase.upload_bytes(path, image_bytes)
        source_paths.append(path)

    session_svc.update_status(
        session_id,
        "uploaded",
        sourceImagePath=source_paths[0],
        sourceImagePaths=source_paths,
        pageCount=len(source_paths),
    )

    return jsonify(
        {
            "sessionId": session_id,
            "sourceImagePath": source_paths[0],
            "sourceImagePaths": source_paths,
            "pageCount": len(source_paths),
        }
    ), 201
