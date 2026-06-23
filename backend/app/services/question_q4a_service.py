"""第4問(A)型（東大・誤り指摘）の多段 AI 生成パイプライン。"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from app.ai.generation_structured_client import GenerationStructuredClient
from app.ai.prompts.question_generation_q4a import (
    build_q4a_problem_user_prompt,
    build_q4a_teacher_pack_user_prompt,
    build_q4a_validator_user_prompt,
)
from app.ai.prompts.universities.registry import (
    build_q4a_problem_system,
    build_q4a_teacher_pack_system,
    build_q4a_validator_system,
)
from app.ai.schemas.q4a_generation import (
    Q4AProblemResult,
    Q4ATeacherPackResult,
    Q4AValidatorResult,
)
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.question_design_service import QuestionDesignService
from app.services.question_type_labels import format_type_label
from app.services.q4a_prompt_markup import (
    Q4A_MAX_UNDERLINE_WORDS,
    Q4A_MIN_UNDERLINE_WORDS,
    ensure_q4a_english_block_markup,
    normalize_q4a_problem_markup,
    q4a_markup_issues,
    underline_word_count,
)
from app.services.question_prompt_markup import normalize_prompt_markup
from app.services.university_context_service import UniversityContextService

logger = logging.getLogger(__name__)

Q4A_DEFAULT_POINTS = 15
Q4A_PART_LABEL = "(A)"
Q4A_DEFAULT_INSTRUCTIONS = (
    "次の英文の下線部(a)～(e)のうち、文法上または内容上の誤りを含むものを一つ選べ。"
)
Q4A_EXPECTED_ITEM_COUNT = 5


def format_q4a_passage_plain(problem: Q4AProblemResult) -> str:
    """全訳用に (a) *...* 記法を除いた英文5段落を返す。"""
    lines: list[str] = []
    for item in sorted(problem.items, key=lambda x: x.number):
        block = ensure_q4a_english_block_markup(item)
        plain = re.sub(r"\([a-e]\)\s*", "", block, flags=re.IGNORECASE)
        plain = re.sub(r"\*([^*]+)\*", r"\1", plain)
        plain = re.sub(r"\s+", " ", plain).strip()
        label = item.item_label.strip() or f"({item.number})"
        lines.append(f"{label} {plain}")
    return "\n\n".join(lines)


def _teacher_pack_issues(pack: Q4ATeacherPackResult, *, item_count: int) -> list[str]:
    issues: list[str] = []
    if len(pack.explanations) != item_count:
        issues.append(
            f"解説が{item_count}件ではない（{len(pack.explanations)}件）。"
            f" number 1〜{item_count} をすべて出力すること"
        )
    numbers = {ex.number for ex in pack.explanations}
    expected = set(range(1, item_count + 1))
    if numbers != expected:
        missing = sorted(expected - numbers)
        if missing:
            issues.append(f"解説の number が不足: {missing}")
    return issues


def normalize_q4a_problem_layout(problem: Q4AProblemResult) -> Q4AProblemResult:
    """各パラグラフごとの日本語指示を除き、冒頭1回の指示 + (1)直後に英文の形式に揃える。"""
    problem.instructions = Q4A_DEFAULT_INSTRUCTIONS
    for item in problem.items:
        item.instruction_ja = ""
    return problem


def format_q4a_problem_for_teacher(problem: Q4AProblemResult) -> str:
    lines: list[str] = []
    if problem.instructions.strip():
        lines.append(problem.instructions.strip())
        lines.append("")
    for item in sorted(problem.items, key=lambda x: x.number):
        label = item.item_label.strip() or f"({item.number})"
        english = ensure_q4a_english_block_markup(item)
        lines.append(f"{label} {english.lstrip()}")
        for p in item.parts:
            mark = " ←誤り" if p.label.lower() == item.error_label.lower() else ""
            lines.append(f"  ({p.label}) {p.text.strip()}{mark}")
        lines.append(f"  [errorLabel: {item.error_label}, category: {item.error_category}]")
        lines.append("")
    return "\n".join(lines).strip()


def assemble_q4a_prompt(*, problem: Q4AProblemResult) -> str:
    """生徒向け問題文（誤りの明示なし）。"""
    lines: list[str] = []
    if problem.instructions.strip():
        lines.append(problem.instructions.strip())
        lines.append("")
    for item in sorted(problem.items, key=lambda x: x.number):
        label = item.item_label.strip() or f"({item.number})"
        english = ensure_q4a_english_block_markup(item)
        lines.append(f"{label} {english.lstrip()}")
    return normalize_prompt_markup("\n".join(lines).strip())


def assemble_q4a_model_answer(pack: Q4ATeacherPackResult) -> str:
    parts: list[str] = ["【解答・解説】", pack.model_answer_summary.strip(), ""]
    for ex in sorted(pack.explanations, key=lambda x: x.number):
        parts.append(
            f"問{ex.number} 誤り=({ex.error_label}) [{ex.error_category}]"
        )
        parts.append(ex.explanation_ja.strip())
        if ex.correction_en.strip():
            parts.append(f"修正例: {ex.correction_en.strip()}")
        parts.append("")
    return "\n".join(parts).strip()


class QuestionQ4AService:
    def __init__(self):
        self.firebase = FirebaseAdminService()
        self.design = QuestionDesignService()
        self.university_ctx = UniversityContextService()
        self.llm = GenerationStructuredClient()

    def _drafts_collection(self, teacher_id: str):
        return self.design._drafts_collection(teacher_id)

    def run_pipeline(
        self,
        *,
        teacher_id: str,
        topic_hint: str = "",
        source_passage: str = "",
        difficulty: str = "standard",
        university_slug: str = "todai",
        reference_years: list[int] | None = None,
    ) -> dict:
        uni_name = self.university_ctx.university_name(university_slug)
        ref_context = self.university_ctx.build_reference_context_for_major(
            teacher_id,
            university_slug,
            major_order=4,
            part_label=Q4A_PART_LABEL,
            reference_years=reference_years,
            limit=2,
            max_chars=5000,
        )
        if not ref_context:
            ref_context = self.university_ctx.build_reference_context_for_major(
                teacher_id,
                university_slug,
                major_order=4,
                part_label=None,
                reference_years=reference_years,
                limit=2,
                max_chars=5000,
            )

        problem: Q4AProblemResult = self.llm.complete_structured(
            system=build_q4a_problem_system(university_slug, uni_name),
            user_text=build_q4a_problem_user_prompt(
                topic_hint=topic_hint,
                source_passage=source_passage,
                difficulty=difficulty,
                university_name=uni_name,
                reference_context=ref_context,
            ),
            response_schema=Q4AProblemResult,
            max_output_tokens=16384,
        )
        problem = normalize_q4a_problem_markup(problem)
        problem = normalize_q4a_problem_layout(problem)

        problem, validator, retried = self._validate_problem(
            problem=problem,
            university_slug=university_slug,
            max_attempts=2,
            topic_hint=topic_hint,
            source_passage=source_passage,
            difficulty=difficulty,
            university_name=uni_name,
            reference_context=ref_context,
        )

        teacher_block = format_q4a_problem_for_teacher(problem)
        passage_plain = format_q4a_passage_plain(problem)
        pack = self._generate_teacher_pack(
            problem=problem,
            teacher_block=teacher_block,
            passage_plain=passage_plain,
            validator_summary=validator.summary,
            university_slug=university_slug,
        )

        prompt = assemble_q4a_prompt(problem=problem)
        model_answer = assemble_q4a_model_answer(pack)

        return {
            "typeLabel": format_type_label(4, Q4A_PART_LABEL),
            "majorOrder": 4,
            "partLabel": Q4A_PART_LABEL,
            "prompt": prompt,
            "modelAnswer": model_answer,
            "points": Q4A_DEFAULT_POINTS,
            "type": "english",
            "answerFormat": "symbol",
            "notes": (
                f"{uni_name} 第4問(A)・誤り指摘パイプライン。"
                f" {problem.source_note or problem.layout}"
            ),
            "referenceExamples": [],
            "anticipatedMistakes": self._default_anticipated_mistakes(),
            "generationPipeline": "q4a",
            "generationArtifacts": {
                "instructions": problem.instructions,
                "layout": problem.layout,
                "sourceNote": problem.source_note,
                "items": [item.model_dump(by_alias=True) for item in problem.items],
                "evaluatorPassed": validator.passed,
                "evaluatorIssues": validator.issues,
                "evaluatorSummary": validator.summary,
                "retriedProblem": retried,
            },
        }

    def _validate_problem(
        self,
        *,
        problem: Q4AProblemResult,
        university_slug: str,
        max_attempts: int,
        topic_hint: str,
        source_passage: str,
        difficulty: str,
        university_name: str,
        reference_context: str,
    ) -> tuple[Q4AProblemResult, Q4AValidatorResult, bool]:
        retried = False
        validator: Q4AValidatorResult | None = None
        current = problem

        for attempt in range(max_attempts):
            block = format_q4a_problem_for_teacher(current)
            validator = self.llm.complete_structured(
                system=build_q4a_validator_system(university_slug, ""),
                user_text=build_q4a_validator_user_prompt(problem_block=block),
                response_schema=Q4AValidatorResult,
                max_output_tokens=4096,
            )
            current = normalize_q4a_problem_markup(current)
            current = normalize_q4a_problem_layout(current)
            structural = self._structural_issues(current)
            markup = q4a_markup_issues(current)
            all_issues = list(validator.issues) + structural + markup
            if validator.passed and not structural:
                validator.issues = []
                return current, validator, retried

            if attempt >= max_attempts - 1:
                validator.issues = all_issues
                validator.passed = False
                return current, validator, retried

            fix = "; ".join(all_issues) or validator.summary
            retried = True
            logger.info("Q4A validator retry (attempt %s): %s", attempt + 1, fix)
            user_text = (
                build_q4a_problem_user_prompt(
                    topic_hint=topic_hint,
                    source_passage=source_passage,
                    difficulty=difficulty,
                    university_name=university_name,
                    reference_context=reference_context,
                )
                + f"\n\n【前回の検証で指摘された点を必ず修正】\n{fix}"
            )
            current = self.llm.complete_structured(
                system=build_q4a_problem_system(university_slug, university_name),
                user_text=user_text,
                response_schema=Q4AProblemResult,
                max_output_tokens=16384,
            )
            current = normalize_q4a_problem_markup(current)
            current = normalize_q4a_problem_layout(current)

        assert validator is not None
        return current, validator, retried

    def _generate_teacher_pack(
        self,
        *,
        problem: Q4AProblemResult,
        teacher_block: str,
        passage_plain: str,
        validator_summary: str,
        university_slug: str,
        max_attempts: int = 2,
    ) -> Q4ATeacherPackResult:
        item_count = len(problem.items) or Q4A_EXPECTED_ITEM_COUNT
        fix_hint = ""
        pack: Q4ATeacherPackResult | None = None

        for attempt in range(max_attempts):
            user_text = build_q4a_teacher_pack_user_prompt(
                problem_block=teacher_block,
                validator_summary=validator_summary,
                passage_plain=passage_plain,
            )
            if fix_hint:
                user_text += f"\n\n【前回の不足を必ず修正】\n{fix_hint}"

            pack = self.llm.complete_structured(
                system=build_q4a_teacher_pack_system(university_slug, ""),
                user_text=user_text,
                response_schema=Q4ATeacherPackResult,
                max_output_tokens=16384,
            )
            issues = _teacher_pack_issues(pack, item_count=item_count)
            if not issues:
                return pack

            fix_hint = "; ".join(issues)
            logger.info("Q4A teacher pack retry (attempt %s): %s", attempt + 1, fix_hint)

        assert pack is not None
        return pack

    @staticmethod
    def _structural_issues(problem: Q4AProblemResult) -> list[str]:
        issues: list[str] = []
        if len(problem.items) != 5:
            issues.append(f"設問数が5つではない（{len(problem.items)}個）")
        if problem.layout.strip() and problem.layout.strip() != "five_paragraphs":
            issues.append(
                f"layout が five_paragraphs ではない（{problem.layout!r}）"
            )
        for item in problem.items:
            if len(item.parts) != 5:
                issues.append(
                    f"問{item.number}: 下線部が5つではない（{len(item.parts)}個）"
                )
            labels = {p.label.lower() for p in item.parts}
            if len(labels) != 5:
                issues.append(f"問{item.number}: 下線ラベル (a)〜(e) が重複または不足")
            for part in item.parts:
                wc = underline_word_count(part.text)
                if wc < Q4A_MIN_UNDERLINE_WORDS or wc > Q4A_MAX_UNDERLINE_WORDS:
                    issues.append(
                        f"問{item.number}: ({part.label}) は{wc}語 "
                        f"（{Q4A_MIN_UNDERLINE_WORDS}〜{Q4A_MAX_UNDERLINE_WORDS}語）"
                    )
            err = item.error_label.strip().lower()
            if err not in labels:
                issues.append(f"問{item.number}: errorLabel が parts に存在しない")
        return issues

    @staticmethod
    def _default_anticipated_mistakes() -> list[str]:
        return [
            "表面的な語形の一致だけで選び、文脈・構文を精読しない",
            "修飾関係の誤り（分詞・関係詞）を見落とす",
            "文法的には可能だが論理が通らない語を正しいと判断する",
        ]

    def generate_and_save_draft(
        self,
        *,
        teacher_id: str,
        university_slug: str | None = None,
        student_id: str | None = None,
        topic_hint: str = "",
        source_passage: str = "",
        difficulty: str = "standard",
        reference_years: list[int] | None = None,
    ) -> dict:
        slug, _meta = self.university_ctx.resolve_for_teacher(
            teacher_id=teacher_id,
            explicit_slug=university_slug,
            student_id=student_id,
            require=True,
        )
        data = self.run_pipeline(
            teacher_id=teacher_id,
            topic_hint=topic_hint,
            source_passage=source_passage,
            difficulty=difficulty,
            university_slug=slug or "todai",
            reference_years=reference_years,
        )

        batch_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc)
        doc = {
            "teacherId": teacher_id,
            "universitySlug": slug,
            "studentId": student_id or "",
            "batchId": batch_id,
            "status": "draft",
            "difficulty": difficulty,
            "topicHint": topic_hint,
            "sourcePassage": source_passage,
            "referenceYears": reference_years or [],
            **data,
            "createdAt": now,
            "updatedAt": now,
        }
        _, ref = self._drafts_collection(teacher_id).add(doc)
        return {**data, "id": ref.id, "batchId": batch_id}
