import logging
import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.question_generation import build_generation_user_prompt
from app.ai.prompts.university_prompts import build_generation_system
from app.services.university_context_service import UniversityContextService
from app.services.question_prompt_markup import (
    append_markup_reminder_if_needed,
    normalize_prompt_markup,
)
from app.ai.prompts.question_validity import VALIDITY_CHECK_SYSTEM, build_validity_user_prompt
from app.ai.schemas.question_design import GeneratedQuestionItem, ValidityCheckResponse
from app.services.q5_scoring import format_q5_part_rubric, scoring_points_from_dicts
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.generation_units import (
    _part_sort_key,
    catalog_to_generation_units,
    pipeline_for_selection,
)
from app.services.past_exam_service import UNIVERSITY_REGISTRY, PastExamService

logger = logging.getLogger(__name__)

COVERAGE_LABELS = {
    "sufficient": "十分",
    "partial": "概ね可",
    "insufficient": "不足",
}

from app.generation_limits import (
    REFERENCE_MODEL_ANSWER_MAX_CHARS,
    REFERENCE_PROMPT_MAX_CHARS,
)

DEDICATED_PIPELINES = frozenset({"q1", "q2", "q1a", "q1b", "q2a", "q2b", "q4a", "q4b", "q5"})


from app.services.question_type_labels import format_type_label, type_key

class QuestionDesignService:
    def __init__(self):
        self.firebase = FirebaseAdminService()
        self.past_exam = PastExamService()
        self.university_ctx = UniversityContextService()
        self.gemini = GeminiAnalysisClient()

    def _university_name(self, slug: str) -> str:
        return self.university_ctx.university_name(slug)

    def _drafts_collection(self, teacher_id: str):
        db = self.firebase.db()
        if not db:
            raise RuntimeError("Firestore is not initialized.")
        return db.collection("teachers").document(teacher_id).collection("question_drafts")

    def list_generation_units(self, teacher_id: str, university_slug: str) -> list[dict]:
        """UI 用の生成単位一覧（第5問は1枠、第2〜4問は大問単位など）。"""
        return catalog_to_generation_units(
            self.list_question_types(teacher_id, university_slug)
        )

    def list_question_types(self, teacher_id: str, university_slug: str) -> list[dict]:
        exam_years = self.past_exam.list_exam_years(teacher_id, university_slug)
        catalog: dict[str, dict] = {}

        for year_row in exam_years:
            year = int(year_row.get("year") or 0)
            if not year:
                continue
            questions = self.past_exam.list_past_questions(
                teacher_id, university_slug, year
            )
            for q in questions:
                major = int(q.get("majorOrder") or 0)
                part = q.get("partLabel")
                key = type_key(major, part)
                if key not in catalog:
                    catalog[key] = {
                        "majorOrder": major,
                        "partLabel": part,
                        "typeLabel": format_type_label(major, part),
                        "years": [],
                        "sampleQuestionIds": [],
                    }
                entry = catalog[key]
                if year not in entry["years"]:
                    entry["years"].append(year)
                if len(entry["sampleQuestionIds"]) < 3:
                    entry["sampleQuestionIds"].append(q.get("id"))

        rows = list(catalog.values())
        for row in rows:
            row["years"] = sorted(row["years"], reverse=True)
        return sorted(
            rows,
            key=lambda r: (int(r["majorOrder"] or 0), _part_sort_key(r.get("partLabel"))),
        )

    def _load_past_questions_for_years(
        self,
        teacher_id: str,
        university_slug: str,
        years: list[int] | None = None,
    ) -> list[dict]:
        if years:
            rows: list[dict] = []
            for year in years:
                rows.extend(
                    self.past_exam.list_past_questions(teacher_id, university_slug, year)
                )
            return rows

        exam_years = self.past_exam.list_exam_years(teacher_id, university_slug)
        rows = []
        for year_row in exam_years:
            year = int(year_row.get("year") or 0)
            if year:
                rows.extend(
                    self.past_exam.list_past_questions(teacher_id, university_slug, year)
                )
        return rows

    @staticmethod
    def _format_past_question_for_prompt(q: dict) -> str:
        major = int(q.get("majorOrder") or 0)
        part = q.get("partLabel")
        label = format_type_label(major, part)
        year = q.get("year")
        profile = q.get("profile") or {}
        return (
            f"### {year} {label}\n"
            f"answerFormat: {q.get('answerFormat', '')}\n"
            f"type: {q.get('type', '')}\n"
            f"points: {q.get('points', '')}\n"
            f"prompt:\n{q.get('prompt', '')[:REFERENCE_PROMPT_MAX_CHARS]}\n"
            f"modelAnswer:\n{(q.get('modelAnswer') or '')[:REFERENCE_MODEL_ANSWER_MAX_CHARS]}\n"
            f"scoringFocus: {profile.get('scoringFocus', '')}\n"
            f"commonTraps: {', '.join(profile.get('commonTraps') or [])}\n"
        )

    def _build_reference_context(
        self,
        past_questions: list[dict],
        *,
        major_order: int | None = None,
        part_label: str | None = None,
        limit: int = 6,
    ) -> str:
        filtered = past_questions
        if major_order is not None:
            filtered = [
                q
                for q in filtered
                if int(q.get("majorOrder") or 0) == major_order
                and (part_label or "").strip() == (q.get("partLabel") or "").strip()
            ]
        if not filtered:
            filtered = past_questions
        filtered = sorted(
            filtered,
            key=lambda q: (int(q.get("year") or 0), int(q.get("majorOrder") or 0)),
            reverse=True,
        )
        blocks = [self._format_past_question_for_prompt(q) for q in filtered[:limit]]
        return "\n".join(blocks) if blocks else "（参照過去問なし）"

    def _load_teacher_materials_snippet(
        self,
        teacher_id: str,
        university_slug: str,
        years: list[int],
        max_chars: int = 3000,
    ) -> str:
        chunks: list[str] = []
        for year in years[:3]:
            material = self.past_exam.get_teacher_exam_material(teacher_id, university_slug, year)
            if material and material.get("content"):
                chunks.append(f"--- {year} ---\n{material['content'][:1200]}")
        text = "\n\n".join(chunks)
        return text[:max_chars]

    def _get_teacher_test(self, test_id: str, teacher_id: str) -> tuple[dict, list[dict]]:
        test = self.firebase.get_doc("tests", test_id)
        if not test:
            raise ValueError("テストが見つかりません")
        if test.get("teacherId") != teacher_id:
            raise PermissionError("このテストにアクセスする権限がありません")

        db = self.firebase.db()
        if not db:
            raise RuntimeError("Firestore is not initialized.")
        qdocs = (
            db.collection("tests")
            .document(test_id)
            .collection("questions")
            .order_by("order")
            .stream()
        )
        questions = []
        for doc in qdocs:
            item = doc.to_dict() or {}
            item["id"] = doc.id
            questions.append(item)
        return test, questions

    def _validity_for_questions(
        self,
        *,
        teacher_id: str,
        university_slug: str,
        test_title: str,
        questions: list[dict],
        reference_years: list[int] | None = None,
    ) -> dict:
        """保存済みテストに依存せず、与えられた設問群の妥当性を点検して payload を返す。"""
        if not questions:
            raise ValueError("設問が登録されていません")

        past_questions = self._load_past_questions_for_years(
            teacher_id, university_slug, reference_years
        )
        if not past_questions:
            raise ValueError("参照できる過去問がありません。先に過去問を取り込んでください。")

        context = self._build_reference_context(past_questions, limit=12)
        years = reference_years or sorted(
            {int(q.get("year") or 0) for q in past_questions if q.get("year")},
            reverse=True,
        )
        materials = self._load_teacher_materials_snippet(teacher_id, university_slug, years)

        user_prompt = build_validity_user_prompt(
            university_name=self._university_name(university_slug),
            university_slug=university_slug,
            teacher_test_title=test_title,
            teacher_questions=questions,
            past_questions_context=context,
            teacher_materials_context=materials,
        )

        result: ValidityCheckResponse = self.gemini.complete_structured(
            system=VALIDITY_CHECK_SYSTEM,
            user_text=user_prompt,
            response_schema=ValidityCheckResponse,
        )

        payload = result.model_dump(by_alias=True)
        for item in payload.get("items", []):
            item["coverageLabel"] = COVERAGE_LABELS.get(
                item.get("coverage", ""), item.get("coverage", "")
            )
        return payload

    def run_validity_check(
        self,
        *,
        teacher_id: str,
        test_id: str,
        university_slug: str,
        reference_years: list[int] | None = None,
        questions_override: list[dict] | None = None,
    ) -> dict:
        test, questions = self._get_teacher_test(test_id, teacher_id)
        if questions_override:
            questions = questions_override

        payload = self._validity_for_questions(
            teacher_id=teacher_id,
            university_slug=university_slug,
            test_title=test.get("title", ""),
            questions=questions,
            reference_years=reference_years,
        )

        now = datetime.now(timezone.utc)
        self.firebase.update_doc(
            "tests",
            test_id,
            {
                "universitySlug": university_slug,
                "lastValidityReport": {**payload, "checkedAt": now},
            },
        )
        return payload

    def _run_generation(
        self,
        *,
        teacher_id: str,
        university_slug: str,
        selections: list[dict],
        reference_years: list[int] | None,
        difficulty: str,
        topic_hint: str,
        count_per_type: int,
        weakness_focus: str = "",
    ) -> list[dict]:
        """過去問を参照して問題を生成し、正規化済みデータ dict の配列を返す（保存はしない）。"""
        if not selections:
            raise ValueError("生成する型を1つ以上選択してください")

        count_per_type = max(1, min(count_per_type, 3))
        past_questions = self._load_past_questions_for_years(
            teacher_id, university_slug, reference_years
        )
        if not past_questions:
            raise ValueError("参照できる過去問がありません")

        enriched_selections = []
        for sel in selections:
            major = int(sel.get("majorOrder") or 0)
            part = sel.get("partLabel")
            enriched_selections.append(
                {
                    "majorOrder": major,
                    "partLabel": part,
                    "typeLabel": sel.get("typeLabel") or format_type_label(major, part),
                }
            )

        ref_blocks = []
        for sel in enriched_selections:
            ref_blocks.append(
                self._build_reference_context(
                    past_questions,
                    major_order=sel["majorOrder"],
                    part_label=sel.get("partLabel"),
                    limit=4,
                )
            )
        reference_context = "\n\n".join(ref_blocks)

        user_prompt = build_generation_user_prompt(
            university_name=self._university_name(university_slug),
            selections=enriched_selections,
            reference_context=reference_context,
            difficulty=difficulty,
            topic_hint=topic_hint,
            count_per_type=count_per_type,
            weakness_focus=weakness_focus,
        )

        class _GenListResponse(BaseModel):
            questions: list[GeneratedQuestionItem] = Field(default_factory=list)

        raw: _GenListResponse = self.gemini.complete_structured(
            system=build_generation_system(
                university_slug, self._university_name(university_slug)
            ),
            user_text=user_prompt,
            response_schema=_GenListResponse,
        )

        normalized: list[dict] = []
        for item in raw.questions:
            data = item.model_dump(by_alias=True)
            data["prompt"] = normalize_prompt_markup(data.get("prompt") or "")
            data["notes"] = append_markup_reminder_if_needed(
                data["prompt"],
                data.get("answerFormat"),
                data.get("notes") or "",
            )
            normalized.append(data)
        return normalized

    def _run_dedicated_pipeline(
        self,
        *,
        teacher_id: str,
        pipeline: str,
        university_slug: str,
        reference_years: list[int] | None,
        difficulty: str,
        topic_hint: str,
    ) -> dict:
        pipeline_kwargs = {
            "teacher_id": teacher_id,
            "topic_hint": topic_hint,
            "difficulty": difficulty,
            "university_slug": university_slug,
            "reference_years": reference_years,
        }
        if pipeline == "q1":
            from app.services.question_q1_service import QuestionQ1Service

            return QuestionQ1Service().run_pipeline(**pipeline_kwargs)
        if pipeline == "q2":
            from app.services.question_q2_service import QuestionQ2Service

            return QuestionQ2Service().run_pipeline(**pipeline_kwargs)
        if pipeline == "q1a":
            from app.services.question_q1a_service import QuestionQ1AService

            return QuestionQ1AService().run_pipeline(**pipeline_kwargs)
        if pipeline == "q1b":
            from app.services.question_q1b_service import QuestionQ1BService

            return QuestionQ1BService().run_pipeline(**pipeline_kwargs)
        if pipeline == "q2a":
            from app.services.question_q2a_service import QuestionQ2AService

            return QuestionQ2AService().run_pipeline(**pipeline_kwargs)
        if pipeline == "q2b":
            from app.services.question_q2b_service import QuestionQ2BService

            return QuestionQ2BService().run_pipeline(**pipeline_kwargs)
        if pipeline == "q4a":
            from app.services.question_q4a_service import QuestionQ4AService

            return QuestionQ4AService().run_pipeline(**pipeline_kwargs)
        if pipeline == "q4b":
            from app.services.question_q4b_service import QuestionQ4BService

            return QuestionQ4BService().run_pipeline(**pipeline_kwargs)
        if pipeline == "q5":
            from app.services.question_q5_service import QuestionQ5Service

            return QuestionQ5Service().run_pipeline(**pipeline_kwargs)
        raise ValueError(f"未対応の専用パイプライン: {pipeline}")

    def _run_generation_with_pipelines(
        self,
        *,
        teacher_id: str,
        university_slug: str,
        selections: list[dict],
        reference_years: list[int] | None,
        difficulty: str,
        topic_hint: str,
        count_per_type: int,
        weakness_focus: str = "",
    ) -> list[dict]:
        """専用パイプライン（第1問A/B・第4問A・第5問）と汎用生成を振り分ける。"""
        if not selections:
            raise ValueError("生成する型を1つ以上選択してください")

        count_per_type = max(1, min(count_per_type, 3))
        normalized: list[dict] = []
        generic_selections: list[dict] = []

        for sel in selections:
            major = int(sel.get("majorOrder") or 0)
            part = sel.get("partLabel")
            pipeline = pipeline_for_selection(major, part)
            if pipeline in DEDICATED_PIPELINES:
                for _ in range(count_per_type):
                    normalized.append(
                        self._run_dedicated_pipeline(
                            teacher_id=teacher_id,
                            pipeline=pipeline,
                            university_slug=university_slug,
                            reference_years=reference_years,
                            difficulty=difficulty,
                            topic_hint=topic_hint,
                        )
                    )
            else:
                generic_selections.append(sel)

        if generic_selections:
            normalized.extend(
                self._run_generation(
                    teacher_id=teacher_id,
                    university_slug=university_slug,
                    selections=generic_selections,
                    reference_years=reference_years,
                    difficulty=difficulty,
                    topic_hint=topic_hint,
                    count_per_type=count_per_type,
                    weakness_focus=weakness_focus,
                )
            )
        return normalized

    def generate_questions(
        self,
        *,
        teacher_id: str,
        university_slug: str | None = None,
        selections: list[dict],
        reference_years: list[int] | None = None,
        difficulty: str = "standard",
        topic_hint: str = "",
        count_per_type: int = 1,
        student_id: str | None = None,
    ) -> dict:
        resolved_slug, _ = self.university_ctx.resolve_for_teacher(
            teacher_id=teacher_id,
            explicit_slug=university_slug,
            student_id=student_id,
            require=True,
        )
        university_slug = resolved_slug or university_slug or "todai"

        normalized = self._run_generation_with_pipelines(
            teacher_id=teacher_id,
            university_slug=university_slug,
            selections=selections,
            reference_years=reference_years,
            difficulty=difficulty,
            topic_hint=topic_hint,
            count_per_type=count_per_type,
        )

        batch_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc)
        draft_ids: list[str] = []
        saved_questions: list[dict] = []

        drafts_ref = self._drafts_collection(teacher_id)
        for data in normalized:
            doc = {
                "teacherId": teacher_id,
                "universitySlug": university_slug,
                "studentId": student_id or "",
                "batchId": batch_id,
                "status": "draft",
                "difficulty": difficulty,
                "topicHint": topic_hint,
                "referenceYears": reference_years or [],
                **data,
                "createdAt": now,
                "updatedAt": now,
            }
            _, ref = drafts_ref.add(doc)
            draft_ids.append(ref.id)
            saved_questions.append({**data, "id": ref.id})

        return {
            "batchId": batch_id,
            "draftIds": draft_ids,
            "questions": saved_questions,
        }

    def list_drafts(self, teacher_id: str) -> list[dict]:
        ref = self._drafts_collection(teacher_id)
        rows = []
        for doc in ref.stream():
            item = doc.to_dict() or {}
            if item.get("status") == "promoted":
                continue
            item["id"] = doc.id
            rows.append(item)
        rows.sort(key=lambda r: r.get("createdAt") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        return rows

    def get_draft(self, teacher_id: str, draft_id: str) -> dict | None:
        snap = self._drafts_collection(teacher_id).document(draft_id).get()
        if not snap.exists:
            return None
        item = snap.to_dict() or {}
        item["id"] = snap.id
        return item

    def delete_draft(self, teacher_id: str, draft_id: str) -> None:
        draft = self.get_draft(teacher_id, draft_id)
        if not draft:
            raise ValueError("下書きが見つかりません")
        self._drafts_collection(teacher_id).document(draft_id).delete()

    def _draft_to_question_data(self, draft: dict, order: int) -> dict:
        q_type = draft.get("type") or "english"
        answer_format = draft.get("answerFormat")

        grading_type = q_type
        if answer_format:
            from app.services.past_exam_service import PastExamService

            mapped = PastExamService._grading_type_for(answer_format, "英語")
            if mapped in ("english", "japanese", "symbol"):
                grading_type = mapped

        data = {
            "order": order,
            "type": grading_type,
            "prompt": draft.get("prompt", ""),
            "modelAnswer": draft.get("modelAnswer", ""),
            "points": int(draft.get("points") or 10),
            "cropRegion": {"x": 50, "y": 50 + (order - 1) * 140, "width": 400, "height": 120},
            "createdAt": datetime.now(timezone.utc),
            "updatedAt": datetime.now(timezone.utc),
        }
        pipeline = draft.get("generationPipeline")
        if pipeline:
            data["generationPipeline"] = pipeline
        if pipeline == "q5":
            data = self._enrich_q5_draft_question(data, draft, order)
        return data

    @staticmethod
    def _q5_sub_answer_format(question_type: str) -> str:
        if question_type.lower() in {
            "content_explanation",
            "reason_explanation",
            "underlined_explanation",
            "short_answer_ja",
        }:
            return "japanese_grid"
        return "short"

    def _enrich_q5_draft_question(self, base: dict, draft: dict, order: int) -> dict:
        sub_questions = (draft.get("generationArtifacts") or {}).get("subQuestions") or []
        if not sub_questions:
            return base

        parts: list[dict] = []
        base_y = 50 + (order - 1) * 140
        for i, sq in enumerate(sorted(sub_questions, key=lambda x: int(x.get("number") or 0))):
            letter = str(sq.get("partLabel") or chr(65 + i)).upper().strip("()")
            label = f"({letter})"
            fmt = self._q5_sub_answer_format(str(sq.get("questionType") or ""))
            part: dict = {
                "label": label,
                "answerFormat": fmt,
                "modelAnswer": "",
                "cropRegion": {
                    "x": 50,
                    "y": base_y + i * 90,
                    "width": 400,
                    "height": 100,
                },
            }
            if fmt == "short":
                part["formatOptions"] = {
                    "symbolTableCount": 5,
                    "symbolTableHeader": "alpha",
                }
            elif fmt == "japanese_grid":
                part["formatOptions"] = {
                    "gridRows": 5,
                    "gridCols": 20,
                    "charLimit": int(sq.get("charLimitJa") or 80),
                }
                model_part = str(sq.get("modelAnswerPart") or "").strip()
                if model_part:
                    part["modelAnswer"] = model_part
                points = scoring_points_from_dicts(sq.get("scoringPoints"))
                direction = str(sq.get("directionCriterionJa") or "").strip()
                if points or direction:
                    part["rubric"] = format_q5_part_rubric(
                        points,
                        direction_criterion=direction,
                        char_limit=int(sq.get("charLimitJa") or 80),
                    )
            parts.append(part)

        base["answerFormat"] = "composite"
        base["partLabelScheme"] = "alpha"
        base["answerParts"] = parts
        return base

    def _mark_draft_promoted(
        self,
        teacher_id: str,
        draft_id: str,
        *,
        test_id: str,
        question_id: str,
    ) -> None:
        self._drafts_collection(teacher_id).document(draft_id).update(
            {
                "status": "promoted",
                "promotedToTestId": test_id,
                "promotedQuestionId": question_id,
                "updatedAt": datetime.now(timezone.utc),
            }
        )

    def promote_draft_as_new_test(
        self,
        *,
        teacher_id: str,
        draft_id: str,
        title: str | None = None,
    ) -> dict:
        draft = self.get_draft(teacher_id, draft_id)
        if not draft:
            raise ValueError("下書きが見つかりません")

        test_title = (title or "").strip() or f"{draft.get('typeLabel', '生成')} 問題セット"
        now = datetime.now(timezone.utc)

        db = self.firebase.db()
        if not db:
            raise RuntimeError("Firestore is not initialized.")

        test_ref = db.collection("tests").document()
        question_data = self._draft_to_question_data(draft, order=1)
        points = question_data["points"]

        test_ref.set(
            {
                "teacherId": teacher_id,
                "title": test_title,
                "templateId": "",
                "totalPoints": points,
                "questionCount": 1,
                "universitySlug": draft.get("universitySlug"),
                "createdAt": now,
                "updatedAt": now,
            }
        )

        qref = test_ref.collection("questions").document()
        qref.set(question_data)

        self._mark_draft_promoted(
            teacher_id,
            draft_id,
            test_id=test_ref.id,
            question_id=qref.id,
        )

        return {
            "testId": test_ref.id,
            "questionId": qref.id,
            "order": 1,
            "testTitle": test_title,
        }

    def promote_draft_to_test(
        self,
        *,
        teacher_id: str,
        draft_id: str,
        test_id: str,
    ) -> dict:
        draft = self.get_draft(teacher_id, draft_id)
        if not draft:
            raise ValueError("下書きが見つかりません")

        test, existing = self._get_teacher_test(test_id, teacher_id)
        next_order = max((int(q.get("order") or 0) for q in existing), default=0) + 1

        question_data = self._draft_to_question_data(draft, next_order)

        db = self.firebase.db()
        if not db:
            raise RuntimeError("Firestore is not initialized.")
        qref = (
            db.collection("tests")
            .document(test_id)
            .collection("questions")
            .document()
        )
        qref.set(question_data)

        total_points = sum(int(q.get("points") or 0) for q in existing) + question_data["points"]
        self.firebase.update_doc(
            "tests",
            test_id,
            {
                "questionCount": len(existing) + 1,
                "totalPoints": total_points,
                "updatedAt": datetime.now(timezone.utc),
            },
        )

        self._mark_draft_promoted(
            teacher_id,
            draft_id,
            test_id=test_id,
            question_id=qref.id,
        )

        return {
            "testId": test_id,
            "questionId": qref.id,
            "order": next_order,
            "testTitle": test.get("title", ""),
        }

    # ------------------------------------------------------------------
    # ② 準備フェーズ: セット下書きパイプライン（build_test_draft）
    # ------------------------------------------------------------------
    def _test_drafts_collection(self, teacher_id: str):
        db = self.firebase.db()
        if not db:
            raise RuntimeError("Firestore is not initialized.")
        return db.collection("teachers").document(teacher_id).collection("test_drafts")

    def _latest_karte_weakness(
        self, student_id: str, teacher_id: str
    ) -> tuple[str, dict | None]:
        """最新カルテスナップショットから、出題に反映する弱点フォーカス文を作る。"""
        student = self.firebase.get_doc("students", student_id)
        if not student:
            raise ValueError("生徒が見つかりません")
        if student.get("teacherId") != teacher_id:
            raise PermissionError("この生徒にアクセスする権限がありません")

        snaps = self.firebase.get_subcollection(["students", student_id, "karte_snapshots"])
        snaps = [s for s in snaps if s.get("generatedAt")]
        snaps.sort(key=lambda s: s.get("generatedAt"), reverse=True)
        if not snaps:
            return "", student

        latest = snaps[0]
        lines: list[str] = []
        summary = (latest.get("weaknessSummary") or "").strip()
        if summary:
            lines.append(summary)

        stages = latest.get("stages") or {}
        weaknesses = ((stages.get("diagnosis") or {}).get("weaknesses")) or []
        for w in weaknesses[:5]:
            label = (w.get("label") or "").strip()
            if label:
                lines.append(f"- {label}（重要度:{w.get('severity', '')}）")

        priority = ((stages.get("readiness") or {}).get("priorityAreas")) or []
        if priority:
            lines.append("優先強化分野: " + ", ".join(str(p) for p in priority))

        return "\n".join(lines), student

    @staticmethod
    def _validity_projection(normalized: list[dict]) -> list[dict]:
        return [
            {
                "order": i,
                "type": data.get("type", "english"),
                "prompt": data.get("prompt", ""),
                "modelAnswer": data.get("modelAnswer", ""),
                "points": int(data.get("points") or 10),
            }
            for i, data in enumerate(normalized, start=1)
        ]

    @staticmethod
    def _has_insufficient(validity: dict | None) -> bool:
        if not validity:
            return False
        return any(
            item.get("coverage") == "insufficient" for item in validity.get("items", [])
        )

    def build_test_draft(
        self,
        *,
        teacher_id: str,
        university_slug: str | None = None,
        selections: list[dict],
        reference_years: list[int] | None = None,
        difficulty: str = "standard",
        topic_hint: str = "",
        count_per_type: int = 1,
        student_id: str | None = None,
        title: str | None = None,
    ) -> dict:
        """準備パイプライン: 傾向収集→（弱点反映）→出題設計→想定誤答→自動検証→セット下書き保存。"""
        resolved_slug, _uni_meta = self.university_ctx.resolve_for_teacher(
            teacher_id=teacher_id,
            explicit_slug=university_slug,
            student_id=student_id,
            require=True,
        )
        university_slug = resolved_slug or university_slug or "todai"

        weakness_focus = ""
        student_name = ""
        if student_id:
            weakness_focus, student = self._latest_karte_weakness(student_id, teacher_id)
            student_name = (student or {}).get("name", "")

        normalized = self._run_generation_with_pipelines(
            teacher_id=teacher_id,
            university_slug=university_slug,
            selections=selections,
            reference_years=reference_years,
            difficulty=difficulty,
            topic_hint=topic_hint,
            count_per_type=count_per_type,
            weakness_focus=weakness_focus,
        )
        if not normalized:
            raise ValueError("問題を生成できませんでした。設定を変えて再試行してください。")

        test_title = (title or "").strip() or (
            f"{student_name} 向け演習セット"
            if student_name
            else f"{self._university_name(university_slug)} 演習セット"
        )

        def _validate(items: list[dict]) -> dict | None:
            try:
                return self._validity_for_questions(
                    teacher_id=teacher_id,
                    university_slug=university_slug,
                    test_title=test_title,
                    questions=self._validity_projection(items),
                    reference_years=reference_years,
                )
            except ValueError:
                # 参照過去問が無い等。検証は省略するがセット作成はブロックしない。
                return None

        validity = _validate(normalized)

        # Stage G: 1回だけ自動リトライ（不足が出た設問の改善要望を再生成のヒントに反映）
        retried = False
        if self._has_insufficient(validity):
            improvements: list[str] = []
            for item in (validity or {}).get("items", []):
                improvements.extend(item.get("improvements") or [])
            retry_hint = topic_hint
            if improvements:
                retry_hint = (
                    f"{topic_hint}\n前回の改善要望: " + "; ".join(improvements[:6])
                ).strip()
            retry_items = self._run_generation(
                teacher_id=teacher_id,
                university_slug=university_slug,
                selections=selections,
                reference_years=reference_years,
                difficulty=difficulty,
                topic_hint=retry_hint,
                count_per_type=count_per_type,
                weakness_focus=weakness_focus,
            )
            if retry_items:
                retry_validity = _validate(retry_items)
                # リトライで改善した場合のみ採用
                if not self._has_insufficient(retry_validity):
                    normalized, validity = retry_items, retry_validity
                    retried = True

        now = datetime.now(timezone.utc)
        total_points = sum(int(d.get("points") or 0) for d in normalized)
        doc = {
            "teacherId": teacher_id,
            "title": test_title,
            "universitySlug": university_slug,
            "studentId": student_id or "",
            "studentName": student_name,
            "weaknessFocus": weakness_focus,
            "difficulty": difficulty,
            "topicHint": topic_hint,
            "referenceYears": reference_years or [],
            "status": "draft",
            "reviewStatus": "draft",
            "questions": normalized,
            "questionCount": len(normalized),
            "totalPoints": total_points,
            "validityReport": validity,
            "autoRetried": retried,
            "createdAt": now,
            "updatedAt": now,
        }
        _, ref = self._test_drafts_collection(teacher_id).add(doc)
        return {**doc, "id": ref.id}

    def list_test_drafts(self, teacher_id: str) -> list[dict]:
        ref = self._test_drafts_collection(teacher_id)
        rows = []
        for doc in ref.stream():
            item = doc.to_dict() or {}
            if item.get("status") == "promoted":
                continue
            item["id"] = doc.id
            rows.append(item)
        rows.sort(
            key=lambda r: r.get("createdAt") or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        return rows

    def get_test_draft(self, teacher_id: str, draft_id: str) -> dict | None:
        snap = self._test_drafts_collection(teacher_id).document(draft_id).get()
        if not snap.exists:
            return None
        item = snap.to_dict() or {}
        item["id"] = snap.id
        return item

    def delete_test_draft(self, teacher_id: str, draft_id: str) -> None:
        draft = self.get_test_draft(teacher_id, draft_id)
        if not draft:
            raise ValueError("セット下書きが見つかりません")
        self._test_drafts_collection(teacher_id).document(draft_id).delete()

    def promote_test_draft_as_new_test(
        self,
        *,
        teacher_id: str,
        draft_id: str,
        title: str | None = None,
    ) -> dict:
        draft = self.get_test_draft(teacher_id, draft_id)
        if not draft:
            raise ValueError("セット下書きが見つかりません")
        questions = draft.get("questions") or []
        if not questions:
            raise ValueError("設問がありません")

        test_title = (title or "").strip() or draft.get("title") or "演習セット"
        now = datetime.now(timezone.utc)

        db = self.firebase.db()
        if not db:
            raise RuntimeError("Firestore is not initialized.")

        test_ref = db.collection("tests").document()
        total_points = 0
        for order, q in enumerate(questions, start=1):
            qdata = self._draft_to_question_data(q, order)
            total_points += qdata["points"]
            test_ref.collection("questions").document().set(qdata)

        test_ref.set(
            {
                "teacherId": teacher_id,
                "title": test_title,
                "templateId": "",
                "totalPoints": total_points,
                "questionCount": len(questions),
                "universitySlug": draft.get("universitySlug"),
                "createdAt": now,
                "updatedAt": now,
            }
        )

        self._test_drafts_collection(teacher_id).document(draft_id).update(
            {
                "status": "promoted",
                "promotedToTestId": test_ref.id,
                "updatedAt": now,
            }
        )

        return {
            "testId": test_ref.id,
            "questionCount": len(questions),
            "testTitle": test_title,
        }
