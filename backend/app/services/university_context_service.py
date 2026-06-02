"""志望校・テスト・過去問コーパスを一貫して university_slug に解決する。"""

from __future__ import annotations

import logging
from typing import Any

from app.services.firebase_admin_service import FirebaseAdminService
from app.services.past_exam_service import UNIVERSITY_REGISTRY, PastExamService
from app.ai.prompts.universities.registry import grading_supplement
from app.services.question_type_labels import format_type_label

logger = logging.getLogger(__name__)

REFERENCE_PROMPT_MAX_CHARS = 8000
REFERENCE_MODEL_ANSWER_MAX_CHARS = 2000


def primary_past_exam_slug(student: dict | None) -> str | None:
    """生徒の第一志望に紐づく過去問コーパス slug（pastExamSlug 優先）。"""
    if not student:
        return None
    profile = student.get("interviewProfile") or {}
    targets = profile.get("targetUniversities") or student.get("targetUniversities") or []
    if not targets:
        return None
    ordered = sorted(targets, key=lambda t: int(t.get("priority") or 99))
    for ref in ordered:
        slug = (ref.get("pastExamSlug") or ref.get("universityId") or "").strip().lower()
        if slug:
            return slug
    return None


class UniversityContextService:
    def __init__(self):
        self.firebase = FirebaseAdminService()
        self.past_exam = PastExamService()

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
        rows: list[dict] = []
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

    @staticmethod
    def _part_labels_match(expected: str | None, actual: str | None) -> bool:
        exp = (expected or "").strip().upper()
        act = (actual or "").strip().upper()
        if exp == act:
            return True
        if exp in ("(A)", "A") and act in ("(A)", "A"):
            return True
        return False

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
                and (
                    part_label is None
                    or part_label == ""
                    or self._part_labels_match(part_label, q.get("partLabel"))
                )
            ]
        if not filtered and major_order is not None:
            filtered = [q for q in past_questions if int(q.get("majorOrder") or 0) == major_order]
        if not filtered:
            filtered = past_questions
        filtered = sorted(
            filtered,
            key=lambda q: (int(q.get("year") or 0), int(q.get("majorOrder") or 0)),
            reverse=True,
        )
        blocks = [self._format_past_question_for_prompt(q) for q in filtered[:limit]]
        return "\n".join(blocks) if blocks else "（参照過去問なし）"

    def get_university_meta(self, slug: str) -> dict:
        slug = (slug or "").strip().lower()
        if not slug:
            return {"slug": "", "name": "", "nameEn": ""}
        doc = self.firebase.get_doc("universities", slug) or {}
        registry = UNIVERSITY_REGISTRY.get(slug, {})
        return {
            "slug": slug,
            "name": doc.get("name") or registry.get("name") or slug,
            "nameEn": doc.get("nameEn") or registry.get("nameEn") or "",
            "examTrends": doc.get("examTrends") or registry.get("examTrends") or "",
        }

    def university_name(self, slug: str) -> str:
        return self.get_university_meta(slug)["name"] or slug

    def resolve_university_slug(
        self,
        *,
        explicit_slug: str | None = None,
        test: dict | None = None,
        student: dict | None = None,
        require: bool = False,
    ) -> str | None:
        """優先順位: 明示 slug > テスト > 生徒第一志望。"""
        for candidate in (
            explicit_slug,
            (test or {}).get("universitySlug"),
            primary_past_exam_slug(student),
        ):
            if candidate and str(candidate).strip():
                return str(candidate).strip().lower()
        if require:
            raise ValueError(
                "志望校（過去問コーパス）が特定できません。"
                " 生徒の志望校を過去問に登録した大学から設定するか、問題セットに大学を指定してください。"
            )
        return None

    def load_student(self, student_id: str, teacher_id: str) -> dict | None:
        if not student_id:
            return None
        doc = self.firebase.get_doc("students", student_id)
        if not doc:
            return None
        if doc.get("teacherId") != teacher_id:
            raise PermissionError("この生徒にアクセスする権限がありません")
        return doc

    def resolve_for_teacher(
        self,
        *,
        teacher_id: str,
        explicit_slug: str | None = None,
        test_id: str | None = None,
        student_id: str | None = None,
        require: bool = False,
    ) -> tuple[str | None, dict]:
        student = self.load_student(student_id or "", teacher_id) if student_id else None
        test = None
        if test_id:
            test = self.firebase.get_doc("tests", test_id)
            if test and test.get("teacherId") != teacher_id:
                raise PermissionError("このテストにアクセスする権限がありません")
        slug = self.resolve_university_slug(
            explicit_slug=explicit_slug,
            test=test,
            student=student,
            require=require,
        )
        meta = self.get_university_meta(slug) if slug else {"slug": "", "name": "", "nameEn": ""}
        return slug, meta

    def build_reference_context_for_major(
        self,
        university_slug: str,
        *,
        major_order: int | None = None,
        part_label: str | None = None,
        reference_years: list[int] | None = None,
        limit: int = 4,
        max_chars: int = 4000,
    ) -> str:
        past = self._load_past_questions_for_years(university_slug, reference_years)
        if not past:
            return ""
        if major_order == 5:
            block = self._build_reference_context(past, major_order=5, part_label=None, limit=limit)
            if block == "（参照過去問なし）":
                filtered = [q for q in past if int(q.get("majorOrder") or 0) == 5]
                if filtered:
                    block = self._build_reference_context(filtered, limit=limit)
            return block[:max_chars] if block != "（参照過去問なし）" else ""

        block = self._build_reference_context(
            past,
            major_order=major_order,
            part_label=part_label,
            limit=limit,
        )
        return block[:max_chars] if block != "（参照過去問なし）" else ""

    def build_grading_context_block(
        self,
        university_slug: str,
        *,
        major_order: int | None = None,
        limit: int = 6,
    ) -> str:
        """添削時に渡す志望校・過去問の出題傾向・失点パターン。"""
        meta = self.get_university_meta(university_slug)

        lines = [
            f"【志望校コンテキスト: {meta['name']}（{university_slug}）】",
        ]
        if meta.get("examTrends"):
            lines.append(f"出題傾向（登録メモ）: {meta['examTrends']}")

        past_all: list[dict] = []
        for year_row in self.past_exam.list_exam_years(university_slug):
            year = int(year_row.get("year") or 0)
            if year:
                past_all.extend(self.past_exam.list_past_questions(university_slug, year))

        if major_order is not None:
            past_all = [q for q in past_all if int(q.get("majorOrder") or 0) == major_order]

        traps: list[str] = []
        focuses: list[str] = []
        for q in past_all[:20]:
            profile = q.get("profile") or {}
            for t in profile.get("commonTraps") or []:
                if t and t not in traps:
                    traps.append(str(t))
            sf = profile.get("scoringFocus") or ""
            if sf and sf not in focuses:
                focuses.append(str(sf))

        if focuses:
            lines.append("過去問の採点の焦点: " + " / ".join(focuses[:5]))
        if traps:
            lines.append("過去問で多い失点パターン: " + " / ".join(traps[:8]))
        if not past_all:
            lines.append("（この大学の過去問はまだ参照データがありません）")

        snippet = self._build_reference_context(
            past_all,
            major_order=major_order,
            limit=min(limit, 3),
        )
        if snippet and snippet != "（参照過去問なし）":
            lines.append("\n【参照過去問（形式・難易度の目安。解答の正誤判定は模範解答を優先）】")
            lines.append(snippet[:2500])

        extra = grading_supplement(university_slug)
        if extra:
            lines.append("\n【この大学固有の添削指示】")
            lines.append(extra)

        return "\n".join(lines)
