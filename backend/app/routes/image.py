import logging

from flask import Blueprint, g, jsonify

from app.services.answer_parts import crop_filename, iter_crop_targets
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.image_processor import align_sheet, crop_region_from_pages
from app.services.session_images import aligned_image_paths, source_image_paths
from app.services.session_service import SessionService
from app.utils.auth_decorator import require_auth

logger = logging.getLogger(__name__)

image_bp = Blueprint("image", __name__)


@image_bp.post("/sessions/<session_id>/align")
@require_auth
def align_session(session_id: str):
    session_svc = SessionService()
    session = session_svc.get_session(session_id)
    if not session or session.get("teacherId") != g.teacher_id:
        return jsonify({"error": "セッションが見つかりません"}), 404

    sources = source_image_paths(session)
    if not sources:
        return jsonify({"error": "ソース画像が見つかりません"}), 404

    session_svc.update_status(session_id, "aligning")
    test = session_svc.get_test(session["testId"])
    template = session_svc.get_template(test["templateId"]) if test else None

    firebase = FirebaseAdminService()
    marks = template.get("alignmentMarks", []) if template else []
    page_w = template.get("pageWidth", 2480) if template else 2480
    page_h = template.get("pageHeight", 3508) if template else 3508

    aligned_paths: list[str] = []
    for index, source_path in enumerate(sources):
        source_bytes = firebase.download_bytes(source_path)
        if not source_bytes:
            return jsonify({"error": f"ソース画像 {index + 1} が見つかりません"}), 404

        aligned_bytes = align_sheet(source_bytes, marks, page_w, page_h)
        aligned_path = f"teachers/{g.teacher_id}/sessions/{session_id}/aligned_p{index + 1}.jpg"
        firebase.upload_bytes(aligned_path, aligned_bytes)
        aligned_paths.append(aligned_path)

    session_svc.update_status(
        session_id,
        "grading",
        alignedImagePath=aligned_paths[0],
        alignedImagePaths=aligned_paths,
    )

    return jsonify({"alignedImagePath": aligned_paths[0], "alignedImagePaths": aligned_paths})


@image_bp.post("/sessions/<session_id>/crop")
@require_auth
def crop_session(session_id: str):
    session_svc = SessionService()
    session = session_svc.get_session(session_id)
    if not session or session.get("teacherId") != g.teacher_id:
        return jsonify({"error": "セッションが見つかりません"}), 404

    firebase = FirebaseAdminService()
    aligned_paths = aligned_image_paths(session)
    if not aligned_paths:
        return jsonify({"error": "位置合わせが完了していません"}), 400

    page_bytes: list[bytes] = []
    for path in aligned_paths:
        data = firebase.download_bytes(path)
        if not data:
            return jsonify({"error": "整列画像が見つかりません"}), 404
        page_bytes.append(data)

    test = session_svc.get_test(session["testId"])
    template = session_svc.get_template(test["templateId"]) if test else None
    page_h = template.get("pageHeight", 3508) if template else 3508

    questions = session_svc.get_questions_for_test(session["testId"])
    crop_paths = []
    for q in questions:
        parts = q.get("answerParts") or []
        has_parts = len(parts) > 0
        targets = iter_crop_targets([q])
        for target in targets:
            try:
                cropped = crop_region_from_pages(page_bytes, target["cropRegion"], page_h)
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400

            filename = crop_filename(target["order"], target["partIndex"], has_parts)
            crop_path = f"teachers/{g.teacher_id}/sessions/{session_id}/crops/{filename}"
            firebase.upload_bytes(crop_path, cropped)
            crop_paths.append(
                {
                    "questionId": target["questionId"],
                    "order": target["order"],
                    "partIndex": target["partIndex"],
                    "partLabel": target.get("partLabel"),
                    "path": crop_path,
                }
            )

    return jsonify({"crops": crop_paths})
