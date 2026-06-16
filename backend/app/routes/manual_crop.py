import logging

from flask import Blueprint, g, jsonify, request

from app.services.answer_parts import crop_filename, iter_crop_targets
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.image_processor import crop_region_from_pages
from app.services.session_images import aligned_image_paths
from app.services.session_service import SessionService
from app.utils.auth_decorator import require_auth

logger = logging.getLogger(__name__)

manual_crop_bp = Blueprint("manual_crop", __name__)


def _crop_key(order: int, part_index: int) -> str:
    return f"{order}-{part_index}"


def _get_session_or_404(session_svc: SessionService, session_id: str):
    session = session_svc.get_session(session_id)
    if not session or session.get("teacherId") != g.teacher_id:
        return None, (jsonify({"error": "セッションが見つかりません"}), 404)
    return session, None


@manual_crop_bp.get("/sessions/<session_id>/crop-targets")
@require_auth
def list_crop_targets(session_id: str):
    session_svc = SessionService()
    session, err = _get_session_or_404(session_svc, session_id)
    if err:
        return err

    aligned_paths = aligned_image_paths(session)
    if not aligned_paths:
        return jsonify(
            {"error": "整列済み画像がありません。先にアップロードと位置合わせを行ってください。"}
        ), 400

    test = session_svc.get_test(session["testId"])
    template = session_svc.get_template(test["templateId"]) if test else None
    page_w = int(template.get("pageWidth", 2480)) if template else 2480
    page_h = int(template.get("pageHeight", 3508)) if template else 3508

    questions = session_svc.get_questions_for_test(session["testId"])
    manual = session.get("manualCrops") or {}

    targets = []
    for q in questions:
        parts = q.get("answerParts") or []
        has_parts = len(parts) > 0
        for target in iter_crop_targets([q]):
            key = _crop_key(target["order"], target["partIndex"])
            saved = manual.get(key) or {}
            targets.append(
                {
                    "questionId": target["questionId"],
                    "order": target["order"],
                    "partIndex": target["partIndex"],
                    "partLabel": target.get("partLabel"),
                    "hasParts": has_parts,
                    "suggestedRegion": target.get("cropRegion"),
                    "savedRegion": saved.get("cropRegion"),
                    "croppedImagePath": saved.get("croppedImagePath"),
                }
            )

    return jsonify(
        {
            "sessionId": session_id,
            "status": session.get("status"),
            "alignedImagePaths": aligned_paths,
            "pageWidth": page_w,
            "pageHeight": page_h,
            "targets": targets,
            "allAssigned": len(targets) > 0
            and all(
                manual.get(_crop_key(t["order"], t["partIndex"]), {}).get("croppedImagePath")
                for t in targets
            ),
        }
    )


@manual_crop_bp.put("/sessions/<session_id>/manual-crops")
@require_auth
def save_manual_crop(session_id: str):
    session_svc = SessionService()
    session, err = _get_session_or_404(session_svc, session_id)
    if err:
        return err

    body = request.get_json(silent=True) or {}
    order = body.get("order")
    part_index = body.get("partIndex", 0)
    region = body.get("cropRegion")

    if order is None or not region:
        return jsonify({"error": "order と cropRegion が必要です"}), 400

    try:
        order = int(order)
        part_index = int(part_index)
    except (TypeError, ValueError):
        return jsonify({"error": "order / partIndex が不正です"}), 400

    w = int(region.get("width", 0))
    h = int(region.get("height", 0))
    if w < 20 or h < 20:
        return jsonify({"error": "切り出し範囲が小さすぎます"}), 400

    aligned_paths = aligned_image_paths(session)
    if not aligned_paths:
        return jsonify({"error": "整列済み画像がありません"}), 400

    test = session_svc.get_test(session["testId"])
    template = session_svc.get_template(test["templateId"]) if test else None
    page_h = int(template.get("pageHeight", 3508)) if template else 3508

    questions = session_svc.get_questions_for_test(session["testId"])
    match = None
    has_parts = False
    for q in questions:
        if q.get("order") != order:
            continue
        parts = q.get("answerParts") or []
        has_parts = len(parts) > 0
        for target in iter_crop_targets([q]):
            if target["partIndex"] == part_index:
                match = target
                break
        break

    if not match:
        return jsonify({"error": "該当する設問が見つかりません"}), 404

    firebase = FirebaseAdminService()
    page_bytes: list[bytes] = []
    for path in aligned_paths:
        data = firebase.download_bytes(path)
        if not data:
            return jsonify({"error": "整列画像の読み込みに失敗しました"}), 404
        page_bytes.append(data)

    try:
        cropped = crop_region_from_pages(page_bytes, region, page_h)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    filename = crop_filename(order, part_index, has_parts)
    crop_path = f"teachers/{g.teacher_id}/sessions/{session_id}/crops/{filename}"
    firebase.upload_bytes(crop_path, cropped)

    key = _crop_key(order, part_index)
    manual = dict(session.get("manualCrops") or {})
    manual[key] = {
        "questionId": match["questionId"],
        "order": order,
        "partIndex": part_index,
        "partLabel": match.get("partLabel"),
        "cropRegion": region,
        "croppedImagePath": crop_path,
    }
    session_svc.update_status(session_id, "crop_review", manualCrops=manual)
    session_svc.touch_draft_saved(session_id)

    targets = []
    for q in questions:
        for target in iter_crop_targets([q]):
            tkey = _crop_key(target["order"], target["partIndex"])
            saved = manual.get(tkey) or {}
            targets.append(
                {
                    "order": target["order"],
                    "partIndex": target["partIndex"],
                    "croppedImagePath": saved.get("croppedImagePath"),
                }
            )
    all_assigned = all(t.get("croppedImagePath") for t in targets)

    return jsonify(
        {
            "sessionId": session_id,
            "key": key,
            "croppedImagePath": crop_path,
            "cropRegion": region,
            "allAssigned": all_assigned,
        }
    )
