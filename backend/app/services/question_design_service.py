import logging
import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.question_generation import GENERATION_SYSTEM, build_generation_user_prompt
from app.ai.prompts.question_validity import VALIDITY_CHECK_SYSTEM, build_validity_user_prompt
from pydantic import BaseModel, Field

from app.ai.schemas.question_design import GeneratedQuestionItem, ValidityCheckResponse
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.past_exam_service import UNIVERSITY_REGISTRY, PastExamService

logger = logging.getLogger(__name__)

COVERAGE_LABELS = {
    "sufficient": "十分",
    "partial": "概ね可",
    "insufficient": "不足",
}

# 参照過去問をプロンプトに載せる上限（読解長文を含めるため modelAnswer より長め）
REFERENCE_PROMPT_MAX_CHARS = 8000
REFERENCE_MODEL_ANSWER_MAX_CHARS = 2000


def format_type_label(major_order: int, part_label: str | None = None) -> str:
    base = f"第{major_order}問"
    label = (part_label or "").strip()
    if label and label != "本文":
        return f"{base}{label}"
    return base


def type_key(major_order: int, part_label: str | None = None) -> str:
    return f"{major_order}:{(part_label or '').strip()}"


class QuestionDesignService:
    def __init__(self):
        self.firebase = FirebaseAdminService()
        self.past_exam = PastExamService()
        self.gemini = GeminiAnalysisClient()

    def _university_name(self, slug: str) -> str:
        return UNIVERSITY_REGISTRY.get(slug, {}).get("name", slug)

    def _drafts_collection(self, teacher_id: str):
        db = self.firebase.db()
        if not db:
            raise RuntimeError("Firestore is not initialized.")
        return db.collection("teachers").document(teacher_id).collection("question_drafts")

    def list_question_types(self, university_slug: str) -> list[dict]:
        exam_years = self.past_exam.list_exam_years(university_slug)
        catalog: dict[str, dict] = {}

        for year_row in exam_years:
            year = int(year_row.get("year") or 0)
            if not year:
                continue
            questions = self.past_exam.list_past_questions(university_slug, year)
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
        return sorted(rows, key=lambda r: (r["majorOrder"], str(r.get("partLabel") or "")))

    def _load_past_questions_for_years(
        self,
        university_slug: str,
        years: list[int] | None = None,
    ) -> list[dict]:
        if years:
            rows: list[dict] = []
            for year in years:
                rows.extend(self.past_exam.list_past_questions(university_slug, year))
            return rows

        exam_years = self.past_exam.list_exam_years(university_slug)
        rows = []
        for year_row in exam_years:
            year = int(year_row.get("year") or 0)
            if year:
                rows.extend(self.past_exam.list_past_questions(university_slug, year))
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
        if not questions:
            raise ValueError("設問が登録されていません")

        past_questions = self._load_past_questions_for_years(university_slug, reference_years)
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
            teacher_test_title=test.get("title", ""),
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
            item["coverageLabel"] = COVERAGE_LABELS.get(item.get("coverage", ""), item.get("coverage", ""))

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

    def generate_questions(
        self,
        *,
        teacher_id: str,
        university_slug: str,
        selections: list[dict],
        reference_years: list[int] | None = None,
        difficulty: str = "standard",
        topic_hint: str = "",
        count_per_type: int = 1,
    ) -> dict:
        if not selections:
            raise ValueError("生成する型を1つ以上選択してください")

        count_per_type = max(1, min(count_per_type, 3))
        past_questions = self._load_past_questions_for_years(university_slug, reference_years)
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
        )

        class _GenListResponse(BaseModel):
            questions: list[GeneratedQuestionItem] = Field(default_factory=list)

        raw: _GenListResponse = self.gemini.complete_structured(
            system=GENERATION_SYSTEM,
            user_text=user_prompt,
            response_schema=_GenListResponse,
        )

        batch_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc)
        draft_ids: list[str] = []
        saved_questions: list[dict] = []

        drafts_ref = self._drafts_collection(teacher_id)
        for item in raw.questions:
            data = item.model_dump(by_alias=True)
            doc = {
                "teacherId": teacher_id,
                "universitySlug": university_slug,
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

        return {
            "order": order,
            "type": grading_type,
            "prompt": draft.get("prompt", ""),
            "modelAnswer": draft.get("modelAnswer", ""),
            "points": int(draft.get("points") or 10),
            "cropRegion": {"x": 50, "y": 50 + (order - 1) * 140, "width": 400, "height": 120},
            "createdAt": datetime.now(timezone.utc),
            "updatedAt": datetime.now(timezone.utc),
        }

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
