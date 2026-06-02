import logging
import tempfile
from pathlib import Path

from flask import Blueprint, g, jsonify, request
from pydantic import ValidationError

from pydantic import BaseModel, Field

from app.ai.schemas.past_exam import PastExamParseResponse
from app.services.past_exam_service import UNIVERSITY_REGISTRY, PastExamService, ProvidedSources
from app.utils.auth_decorator import require_auth

logger = logging.getLogger(__name__)

past_exam_bp = Blueprint("past_exam", __name__)


class RegisterUniversityBody(BaseModel):
    slug: str
    name: str
    name_en: str = Field(default="", alias="nameEn")

    model_config = {"populate_by_name": True}


def _validate_year(year: int | None) -> tuple[int | None, tuple | None]:
    if year is None:
        return None, (jsonify({"error": "年度（year）が必要です"}), 400)
    if year < 1900 or year > 2100:
        return None, (jsonify({"error": "年度は 1900〜2100 の範囲で指定してください"}), 400)
    return year, None


def _validate_slug(slug: str) -> tuple | None:
    if not slug or not slug.replace("-", "").replace("_", "").isalnum():
        return jsonify({"error": "大学 slug が不正です"}), 400
    return None


@past_exam_bp.get("/universities")
@require_auth
def list_universities():
    service = PastExamService()
    universities = service.list_universities()
    return jsonify({"universities": universities})


@past_exam_bp.post("/universities")
@require_auth
def register_university():
    try:
        body = RegisterUniversityBody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": str(exc.errors()[0]["msg"])}), 400

    slug_error = _validate_slug(body.slug)
    if slug_error:
        return slug_error

    service = PastExamService()
    try:
        row = service.register_university(
            slug=body.slug,
            name=body.name,
            name_en=body.name_en,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"university": row}), 201


@past_exam_bp.get("/universities/<slug>/prompt-config")
@require_auth
def get_university_prompt_config(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    from app.ai.prompts.universities.registry import get_prompt_status

    status = get_prompt_status(slug)
    return jsonify(
        {
            "slug": status.slug,
            "hasCustomModule": status.has_custom_module,
            "configuredKeys": status.configured_keys,
            "usesDefaults": len(status.configured_keys) == 0,
            "templatePath": "backend/app/ai/prompts/universities/_template.py",
        }
    )


@past_exam_bp.get("/universities/<slug>/exam-years")
@require_auth
def list_exam_years(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    service = PastExamService()
    try:
        exam_years = service.list_exam_years(slug)
        return jsonify({"examYears": exam_years})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@past_exam_bp.get("/universities/<slug>/exam-years/<int:year>")
@require_auth
def get_exam_year_detail(slug: str, year: int):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    service = PastExamService()
    try:
        exam_year = service.get_exam_year(slug, year)
        questions = service.list_past_questions(slug, year)
        return jsonify({"examYear": exam_year, "questions": questions})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@past_exam_bp.get("/universities/<slug>/exam-years/<int:year>/teacher-materials")
@require_auth
def get_teacher_materials(slug: str, year: int):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    service = PastExamService()
    try:
        material = service.get_teacher_exam_material(g.teacher_id, slug, year)
        return jsonify({"material": material})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@past_exam_bp.put("/universities/<slug>/exam-years/<int:year>/teacher-materials")
@require_auth
def save_teacher_materials(slug: str, year: int):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    body = request.get_json(silent=True) or {}
    title = body.get("title", "")
    content = body.get("content", "")
    attachments = body.get("attachments") or []
    if not isinstance(attachments, list):
        return jsonify({"error": "attachments は配列で指定してください"}), 400

    service = PastExamService()
    try:
        material = service.save_teacher_exam_material(
            g.teacher_id,
            slug,
            year,
            title=title,
            content=content,
            attachments=attachments,
        )
        return jsonify({"material": material})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@past_exam_bp.post("/universities/<slug>/past-exams/import")
@require_auth
def import_past_exam(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    year, year_error = _validate_year(request.form.get("year", type=int))
    if year_error:
        return year_error

    exam_files = request.files.getlist("examPdf")
    if not exam_files or all(not f.filename for f in exam_files):
        single = request.files.get("examPdf")
        exam_files = [single] if single and single.filename else []

    answers_file = request.files.get("answersPdf")
    listening_file = request.files.get("listeningPdf")
    analysis_file = request.files.get("analysisPdf")

    has_answers = bool(answers_file and answers_file.filename)
    has_listening = bool(listening_file and listening_file.filename)
    has_analysis = bool(analysis_file and analysis_file.filename)
    has_exam = bool(exam_files)

    if not (has_exam or has_answers or has_listening or has_analysis):
        return jsonify({"error": "いずれか1つ以上の PDF を選択してください"}), 400

    provided = ProvidedSources(
        exam=has_exam,
        answers=has_answers,
        listening=has_listening,
        analysis=has_analysis,
    )

    service = PastExamService()
    temp_dir = Path(tempfile.mkdtemp(prefix="hgk-past-exam-"))

    try:
        exam_paths: list[Path] = []
        for index, exam_file in enumerate(exam_files):
            if not exam_file.filename:
                continue
            dest = temp_dir / (f"exam{index + 1}.pdf" if index else "exam.pdf")
            exam_file.save(dest)
            exam_paths.append(dest)

        answers_path: Path | None = None
        if answers_file and answers_file.filename:
            answers_path = temp_dir / "answers.pdf"
            answers_file.save(answers_path)

        listening_path: Path | None = None
        if listening_file and listening_file.filename:
            listening_path = temp_dir / "listening.pdf"
            listening_file.save(listening_path)

        analysis_path: Path | None = None
        if analysis_file and analysis_file.filename:
            analysis_path = temp_dir / "analysis.pdf"
            analysis_file.save(analysis_path)

        sources = service.build_sources_from_paths(
            exam_paths,
            answers_pdf=answers_path,
            listening_pdf=listening_path,
            analysis_pdf=analysis_path,
        )

        logger.info(
            "Past exam import started by %s: %s/%s (%s exam PDFs)",
            g.teacher_id,
            slug,
            year,
            len(sources.exam_pdfs),
        )

        parsed = service.parse_partial_sources(
            university_slug=slug,
            year=year,
            sources=sources,
            provided=provided,
        )
        session_id = service.create_import_session(
            university_slug=slug,
            year=year,
            sources=sources,
            parsed=parsed,
            provided=provided,
        )

        registry = UNIVERSITY_REGISTRY.get(slug, {})
        return jsonify(
            {
                "sessionId": session_id,
                "universitySlug": slug,
                "universityName": registry.get("name") or parsed.university_name or slug,
                "year": year,
                "questionCount": len(parsed.questions),
                "listeningScriptCount": len(parsed.listening_scripts),
                "parseNotes": parsed.parse_notes,
                "uploadedSlots": [k for k, v in provided.to_manifest().items() if v],
                "parsed": parsed.model_dump(by_alias=True),
            }
        ), 201
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 400
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        logger.exception("Past exam import failed for %s/%s", slug, year)
        return jsonify({"error": f"取り込みに失敗しました: {exc}"}), 500
    finally:
        import shutil

        shutil.rmtree(temp_dir, ignore_errors=True)


@past_exam_bp.post("/universities/<slug>/past-exams/import/<session_id>/commit")
@require_auth
def commit_past_exam_import(slug: str, session_id: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    body = request.get_json(silent=True) or {}
    profile_status = body.get("profileStatus", "draft")
    if profile_status not in {"draft", "approved"}:
        return jsonify({"error": "profileStatus は draft または approved を指定してください"}), 400

    service = PastExamService()

    try:
        session_slug, year, parsed, sources, provided = service.load_import_session(session_id)
    except FileNotFoundError:
        return jsonify({"error": "取り込みセッションが見つかりません。再度 PDF をアップロードしてください。"}), 404

    if session_slug != slug:
        return jsonify({"error": "大学 slug がセッションと一致しません"}), 400

    if body.get("parsed"):
        try:
            parsed = PastExamParseResponse.model_validate(body["parsed"])
            service.update_import_session_parsed(session_id, parsed)
        except ValidationError as exc:
            return jsonify({"error": "parsed の形式が不正です", "details": exc.errors()}), 400

    try:
        result = service.write_to_firestore(
            university_slug=slug,
            year=year,
            parsed=parsed,
            sources=sources,
            upload_pdf=True,
            profile_status=profile_status,
            provided=provided,
        )
        service.delete_import_session(session_id)
        logger.info(
            "Past exam committed by %s: %s/%s (%s questions)",
            g.teacher_id,
            slug,
            year,
            len(parsed.questions),
        )
        return jsonify(result), 200
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:
        logger.exception("Past exam commit failed for %s/%s session=%s", slug, year, session_id)
        return jsonify({"error": f"保存に失敗しました: {exc}"}), 500
