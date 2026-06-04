import logging

from flask import Blueprint, g, jsonify

from app.ai.anthropic_client import AnthropicVisionClient
from app.ai.schemas.grading import GradeResult
from app.services.answer_parts import iter_crop_targets
from app.services.grading_prompt import (
    build_text_user_prompt,
    grading_response_schema,
    select_grading_prompts,
)
from app.services.karte_service import KarteService
from app.services.scoring import clamp_score, to_score_out_of_100
from app.services.session_service import SessionService
from app.services.university_context_service import UniversityContextService
from app.utils.auth_decorator import require_auth

logger = logging.getLogger(__name__)

grading_bp = Blueprint("grading", __name__)


def _result_key(result: dict) -> tuple:
    return (result.get("questionId"), result.get("partIndex"))


@grading_bp.post("/sessions/<session_id>/grade")
@require_auth
def grade_session(session_id: str):
    session_svc = SessionService()
    session = session_svc.get_session(session_id)
    if not session or session.get("teacherId") != g.teacher_id:
        return jsonify({"error": "セッションが見つかりません"}), 404

    existing = session_svc.get_question_results(session_id)
    if not existing:
        return jsonify(
            {"error": "転記結果がありません。先に読み取りを実行してください。"}
        ), 400

    unconfirmed = [
        r
        for r in existing
        if r.get("transcriptionStatus") != "confirmed"
    ]
    if unconfirmed:
        return jsonify(
            {
                "error": "転記が未確定の設問があります。確認画面で内容を確定してください。"
            }
        ), 400

    session_svc.update_status(session_id, "grading")
    student_doc = session_svc.firebase.get_doc("students", session.get("studentId", ""))
    student_name = (student_doc or {}).get("name", "") or ""
    test_doc = session_svc.get_test(session["testId"]) or {}
    uni_ctx = UniversityContextService()
    uni_slug = uni_ctx.resolve_university_slug(
        explicit_slug=test_doc.get("universitySlug"),
        student=student_doc,
    )
    questions = session_svc.get_questions_for_test(session["testId"])
    targets = iter_crop_targets(questions)
    by_key = {_result_key(r): r for r in existing}
    client = AnthropicVisionClient()

    total_score = 0.0
    max_score = 0.0
    results = []

    try:
        for i, target in enumerate(targets):
            label = target.get("partLabel") or f"第{target.get('order')}問"
            session_svc.update_progress(
                session_id, i, len(targets), f"{label}を添削中"
            )

            stored = by_key.get(_result_key(target))
            if not stored:
                continue

            student_text = (stored.get("studentAnswerText") or "").strip()
            if not student_text:
                return jsonify(
                    {"error": f"第{target.get('order')}問の転記が空です。確認画面で入力してください。"}
                ), 400

            system, _prompt_fn = select_grading_prompts(target)
            uni_block = ""
            if uni_slug:
                uni_block = uni_ctx.build_grading_context_block(
                    g.teacher_id,
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

            grade: GradeResult = client.complete_structured(
                system=system,
                user_text=user_text,
                response_schema=schema,
            )

            max_points = float(target.get("points", grade.max_points))
            score = clamp_score(grade.score, max_points)
            total_score += score
            max_score += max_points

            result_data = {
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
            if content_eval:
                result_data["contentEvaluation"] = content_eval
            if grammar_eval:
                result_data["grammarEvaluation"] = grammar_eval
            if polished:
                result_data["polishedAnswer"] = polished
            session_svc.update_question_result(session_id, stored["id"], result_data)
            result_data["id"] = stored["id"]
            result_data["questionId"] = stored.get("questionId")
            result_data["order"] = stored.get("order")
            result_data["partLabel"] = stored.get("partLabel")
            results.append(result_data)
    except Exception as exc:
        logger.exception("Grading failed for session %s", session_id)
        session_svc.update_status(session_id, "transcription_review")
        message = str(exc)
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
        return jsonify({"error": "添削中にエラーが発生しました。しばらくしてから再試行してください。"}), 500

    total_score_100 = to_score_out_of_100(total_score, max_score)

    session_svc.save_grading_scores(
        session_id,
        total_score,
        max_score=max_score,
        total_score_100=total_score_100,
        aligned_path=session.get("alignedImagePath"),
    )

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
