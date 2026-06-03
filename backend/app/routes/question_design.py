import logging

from flask import Blueprint, g, jsonify, request
from pydantic import BaseModel, Field, ValidationError

from app.services.question_design_service import QuestionDesignService
from app.services.question_q2_service import QuestionQ2Service
from app.services.question_q1_service import QuestionQ1Service
from app.services.question_q1a_service import QuestionQ1AService
from app.services.question_q1b_service import QuestionQ1BService
from app.services.question_q2a_service import QuestionQ2AService
from app.services.question_q2b_service import QuestionQ2BService
from app.services.question_q4a_service import QuestionQ4AService
from app.services.question_q4b_service import QuestionQ4BService
from app.services.question_q5_service import QuestionQ5Service
from app.utils.auth_decorator import require_auth

logger = logging.getLogger(__name__)

question_design_bp = Blueprint("question_design", __name__)


def _validate_slug(slug: str) -> tuple | None:
    if not slug or not slug.replace("-", "").replace("_", "").isalnum():
        return jsonify({"error": "大学 slug が不正です"}), 400
    return None


class ValidityCheckBody(BaseModel):
    university_slug: str = Field(alias="universitySlug", default="todai")
    reference_years: list[int] | None = Field(alias="referenceYears", default=None)
    questions: list[dict] | None = None

    model_config = {"populate_by_name": True}


class TypeSelection(BaseModel):
    major_order: int = Field(alias="majorOrder")
    part_label: str | None = Field(alias="partLabel", default=None)
    type_label: str | None = Field(alias="typeLabel", default=None)

    model_config = {"populate_by_name": True}


class GenerateQuestionsBody(BaseModel):
    selections: list[TypeSelection]
    reference_years: list[int] | None = Field(alias="referenceYears", default=None)
    difficulty: str = "standard"
    topic_hint: str = Field(alias="topicHint", default="")
    count_per_type: int = Field(alias="countPerType", default=1, ge=1, le=3)
    student_id: str | None = Field(alias="studentId", default=None)

    model_config = {"populate_by_name": True}


class PromoteDraftBody(BaseModel):
    test_id: str = Field(alias="testId")

    model_config = {"populate_by_name": True}


class BuildTestDraftBody(BaseModel):
    selections: list[TypeSelection]
    reference_years: list[int] | None = Field(alias="referenceYears", default=None)
    difficulty: str = "standard"
    topic_hint: str = Field(alias="topicHint", default="")
    count_per_type: int = Field(alias="countPerType", default=1, ge=1, le=3)
    student_id: str | None = Field(alias="studentId", default=None)
    title: str | None = None

    model_config = {"populate_by_name": True}


class PromoteDraftAsNewTestBody(BaseModel):
    title: str | None = None

    model_config = {"populate_by_name": True}


class GenerateQ5Body(BaseModel):
    reference_years: list[int] | None = Field(alias="referenceYears", default=None)
    difficulty: str = "standard"
    topic_hint: str = Field(alias="topicHint", default="")
    student_id: str | None = Field(alias="studentId", default=None)

    model_config = {"populate_by_name": True}


class GenerateQ4ABody(BaseModel):
    reference_years: list[int] | None = Field(alias="referenceYears", default=None)
    difficulty: str = "standard"
    topic_hint: str = Field(alias="topicHint", default="")
    source_passage: str = Field(alias="sourcePassage", default="")
    student_id: str | None = Field(alias="studentId", default=None)

    model_config = {"populate_by_name": True}


class GenerateQ4BBody(BaseModel):
    reference_years: list[int] | None = Field(alias="referenceYears", default=None)
    difficulty: str = "standard"
    topic_hint: str = Field(alias="topicHint", default="")
    student_id: str | None = Field(alias="studentId", default=None)

    model_config = {"populate_by_name": True}


class GenerateQ1ABody(BaseModel):
    reference_years: list[int] | None = Field(alias="referenceYears", default=None)
    difficulty: str = "standard"
    topic_hint: str = Field(alias="topicHint", default="")
    source_passage: str = Field(alias="sourcePassage", default="")
    student_id: str | None = Field(alias="studentId", default=None)

    model_config = {"populate_by_name": True}


class GenerateQ1BBody(BaseModel):
    reference_years: list[int] | None = Field(alias="referenceYears", default=None)
    difficulty: str = "standard"
    topic_hint: str = Field(alias="topicHint", default="")
    source_passage: str = Field(alias="sourcePassage", default="")
    student_id: str | None = Field(alias="studentId", default=None)

    model_config = {"populate_by_name": True}


class GenerateQ2ABody(BaseModel):
    reference_years: list[int] | None = Field(alias="referenceYears", default=None)
    difficulty: str = "standard"
    topic_hint: str = Field(alias="topicHint", default="")
    student_id: str | None = Field(alias="studentId", default=None)

    model_config = {"populate_by_name": True}


class GenerateQ2BBody(BaseModel):
    reference_years: list[int] | None = Field(alias="referenceYears", default=None)
    difficulty: str = "standard"
    topic_hint: str = Field(alias="topicHint", default="")
    student_id: str | None = Field(alias="studentId", default=None)

    model_config = {"populate_by_name": True}


@question_design_bp.post("/universities/<slug>/generate-q2b")
@require_auth
def generate_q2b(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    try:
        body = GenerateQ2BBody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionQ2BService()
    try:
        draft = service.generate_and_save_draft(
            teacher_id=g.teacher_id,
            university_slug=slug,
            student_id=body.student_id,
            topic_hint=body.topic_hint,
            difficulty=body.difficulty,
            reference_years=body.reference_years,
        )
        return jsonify({"draft": draft}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.post("/universities/<slug>/generate-q2a")
@require_auth
def generate_q2a(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    try:
        body = GenerateQ2ABody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionQ2AService()
    try:
        draft = service.generate_and_save_draft(
            teacher_id=g.teacher_id,
            university_slug=slug,
            student_id=body.student_id,
            topic_hint=body.topic_hint,
            difficulty=body.difficulty,
            reference_years=body.reference_years,
        )
        return jsonify({"draft": draft}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.post("/universities/<slug>/generate-q1b")
@require_auth
def generate_q1b(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    try:
        body = GenerateQ1BBody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionQ1BService()
    try:
        draft = service.generate_and_save_draft(
            teacher_id=g.teacher_id,
            university_slug=slug,
            student_id=body.student_id,
            topic_hint=body.topic_hint,
            source_passage=body.source_passage,
            difficulty=body.difficulty,
            reference_years=body.reference_years,
        )
        return jsonify({"draft": draft}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.post("/universities/<slug>/generate-q2")
@require_auth
def generate_q2(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    try:
        body = GenerateQ1ABody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionQ2Service()
    try:
        draft = service.generate_and_save_draft(
            teacher_id=g.teacher_id,
            university_slug=slug,
            student_id=body.student_id,
            topic_hint=body.topic_hint,
            source_passage=body.source_passage,
            difficulty=body.difficulty,
            reference_years=body.reference_years,
        )
        return jsonify({"draft": draft}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.post("/universities/<slug>/generate-q1")
@require_auth
def generate_q1(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    try:
        body = GenerateQ1ABody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionQ1Service()
    try:
        draft = service.generate_and_save_draft(
            teacher_id=g.teacher_id,
            university_slug=slug,
            student_id=body.student_id,
            topic_hint=body.topic_hint,
            source_passage=body.source_passage,
            difficulty=body.difficulty,
            reference_years=body.reference_years,
        )
        return jsonify({"draft": draft}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.post("/universities/<slug>/generate-q1a")
@require_auth
def generate_q1a(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    try:
        body = GenerateQ1ABody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionQ1AService()
    try:
        draft = service.generate_and_save_draft(
            teacher_id=g.teacher_id,
            university_slug=slug,
            student_id=body.student_id,
            topic_hint=body.topic_hint,
            source_passage=body.source_passage,
            difficulty=body.difficulty,
            reference_years=body.reference_years,
        )
        return jsonify({"draft": draft}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.get("/universities/<slug>/generation-units")
@require_auth
def list_generation_units(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    service = QuestionDesignService()
    try:
        units = service.list_generation_units(g.teacher_id, slug)
        return jsonify({"generationUnits": units})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.post("/universities/<slug>/generate-q4b")
@require_auth
def generate_q4b(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    try:
        body = GenerateQ4BBody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionQ4BService()
    try:
        draft = service.generate_and_save_draft(
            teacher_id=g.teacher_id,
            university_slug=slug,
            student_id=body.student_id,
            topic_hint=body.topic_hint,
            difficulty=body.difficulty,
            reference_years=body.reference_years,
        )
        return jsonify({"draft": draft}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.post("/universities/<slug>/generate-q4a")
@require_auth
def generate_q4a(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    try:
        body = GenerateQ4ABody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionQ4AService()
    try:
        draft = service.generate_and_save_draft(
            teacher_id=g.teacher_id,
            university_slug=slug,
            student_id=body.student_id,
            topic_hint=body.topic_hint,
            source_passage=body.source_passage,
            difficulty=body.difficulty,
            reference_years=body.reference_years,
        )
        return jsonify({"draft": draft}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.post("/universities/<slug>/generate-q5")
@require_auth
def generate_q5(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    try:
        body = GenerateQ5Body.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionQ5Service()
    try:
        draft = service.generate_and_save_draft(
            teacher_id=g.teacher_id,
            university_slug=slug,
            student_id=body.student_id,
            topic_hint=body.topic_hint,
            difficulty=body.difficulty,
            reference_years=body.reference_years,
        )
        return jsonify({"draft": draft}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.get("/universities/<slug>/question-types")
@require_auth
def list_question_types(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    service = QuestionDesignService()
    try:
        types = service.list_question_types(g.teacher_id, slug)
        return jsonify({"questionTypes": types})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.post("/tests/<test_id>/validity-check")
@require_auth
def validity_check(test_id: str):
    try:
        body = ValidityCheckBody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionDesignService()
    try:
        report = service.run_validity_check(
            teacher_id=g.teacher_id,
            test_id=test_id,
            university_slug=body.university_slug,
            reference_years=body.reference_years,
            questions_override=body.questions,
        )
        return jsonify({"report": report})
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.post("/universities/<slug>/generate-questions")
@require_auth
def generate_questions(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    try:
        body = GenerateQuestionsBody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionDesignService()
    try:
        result = service.generate_questions(
            teacher_id=g.teacher_id,
            university_slug=slug,
            selections=[s.model_dump(by_alias=True) for s in body.selections],
            reference_years=body.reference_years,
            difficulty=body.difficulty,
            topic_hint=body.topic_hint,
            count_per_type=body.count_per_type,
            student_id=body.student_id,
        )
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.post("/universities/<slug>/build-test-draft")
@require_auth
def build_test_draft(slug: str):
    slug_error = _validate_slug(slug)
    if slug_error:
        return slug_error

    try:
        body = BuildTestDraftBody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionDesignService()
    try:
        draft = service.build_test_draft(
            teacher_id=g.teacher_id,
            university_slug=slug,
            selections=[s.model_dump(by_alias=True) for s in body.selections],
            reference_years=body.reference_years,
            difficulty=body.difficulty,
            topic_hint=body.topic_hint,
            count_per_type=body.count_per_type,
            student_id=body.student_id,
            title=body.title,
        )
        return jsonify({"draft": draft}), 201
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.get("/test-drafts")
@require_auth
def list_test_drafts():
    service = QuestionDesignService()
    try:
        drafts = service.list_test_drafts(g.teacher_id)
        return jsonify({"drafts": drafts})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.get("/test-drafts/<draft_id>")
@require_auth
def get_test_draft(draft_id: str):
    service = QuestionDesignService()
    draft = service.get_test_draft(g.teacher_id, draft_id)
    if not draft:
        return jsonify({"error": "セット下書きが見つかりません"}), 404
    return jsonify({"draft": draft})


@question_design_bp.delete("/test-drafts/<draft_id>")
@require_auth
def delete_test_draft(draft_id: str):
    service = QuestionDesignService()
    try:
        service.delete_test_draft(g.teacher_id, draft_id)
        return jsonify({"status": "deleted"})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404


@question_design_bp.post("/test-drafts/<draft_id>/promote-new")
@require_auth
def promote_test_draft_as_new_test(draft_id: str):
    try:
        body = PromoteDraftAsNewTestBody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionDesignService()
    try:
        result = service.promote_test_draft_as_new_test(
            teacher_id=g.teacher_id,
            draft_id=draft_id,
            title=body.title,
        )
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.get("/question-drafts")
@require_auth
def list_drafts():
    service = QuestionDesignService()
    try:
        drafts = service.list_drafts(g.teacher_id)
        return jsonify({"drafts": drafts})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.get("/question-drafts/<draft_id>")
@require_auth
def get_draft(draft_id: str):
    service = QuestionDesignService()
    draft = service.get_draft(g.teacher_id, draft_id)
    if not draft:
        return jsonify({"error": "下書きが見つかりません"}), 404
    return jsonify({"draft": draft})


@question_design_bp.delete("/question-drafts/<draft_id>")
@require_auth
def delete_draft(draft_id: str):
    service = QuestionDesignService()
    try:
        service.delete_draft(g.teacher_id, draft_id)
        return jsonify({"status": "deleted"})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404


@question_design_bp.post("/question-drafts/<draft_id>/promote-new")
@require_auth
def promote_draft_as_new_test(draft_id: str):
    try:
        body = PromoteDraftAsNewTestBody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionDesignService()
    try:
        result = service.promote_draft_as_new_test(
            teacher_id=g.teacher_id,
            draft_id=draft_id,
            title=body.title,
        )
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503


@question_design_bp.post("/question-drafts/<draft_id>/promote")
@require_auth
def promote_draft(draft_id: str):
    try:
        body = PromoteDraftBody.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        return jsonify({"error": exc.errors()}), 400

    service = QuestionDesignService()
    try:
        result = service.promote_draft_to_test(
            teacher_id=g.teacher_id,
            draft_id=draft_id,
            test_id=body.test_id,
        )
        return jsonify(result)
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
