"""第4問(B)型（東大・下線部和訳）の AI 生成パイプライン。"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from app.ai.generation_structured_client import GenerationStructuredClient
from app.ai.prompts.question_generation_q4b import (
    build_q4b_generation_user_prompt,
    build_q4b_validator_user_prompt,
)
from app.ai.prompts.universities.registry import (
    build_q4b_generation_system,
    build_q4b_validator_system,
)
from app.ai.schemas.q4b_generation import (
    Q4B_BLANK_LABELS,
    Q4BGenerationResult,
    Q4BValidatorResult,
)
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.question_design_service import QuestionDesignService
from app.services.question_prompt_markup import has_underline_markup, normalize_prompt_markup
from app.services.question_type_labels import format_type_label
from app.services.university_context_service import UniversityContextService

logger = logging.getLogger(__name__)

Q4B_DEFAULT_POINTS = 25
Q4B_PART_LABEL = "(B)"

_UNDERLINE_RE = re.compile(r"\*([^*\n]+)\*")


def english_word_count(text: str) -> int:
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text)
    return len(words)


def count_underline_spans(text: str) -> int:
    return len(_UNDERLINE_RE.findall(text))


def format_q4b_for_validator(result: Q4BGenerationResult) -> str:
    words = english_word_count(result.passage)
    lines = [
        f"theme: {result.theme}",
        f"wordCount(claimed): {result.word_count} / actual~{words}",
        f"instructionJa: {result.instruction_ja}",
        f"segmentIExtraInstructionJa: {result.segment_i_extra_instruction_ja}",
        "",
        "passage:",
        result.passage,
        "",
        "underlinedSegments:",
    ]
    for seg in result.underlined_segments:
        lines.append(f"  ({seg.blank_label}): {seg.english.strip()}")
        if seg.highlight_word:
            lines.append(f"    highlightWord: {seg.highlight_word}")
    lines.append("")
    lines.append("sampleAnswers:")
    for ans in result.sample_answers:
        lines.append(f"  ({ans.blank_label}): {ans.translation_ja.strip()}")
    return "\n".join(lines)


def assemble_q4b_prompt(*, result: Q4BGenerationResult) -> str:
    parts: list[str] = []
    if result.instruction_ja.strip():
        parts.append(result.instruction_ja.strip())
    if result.segment_i_extra_instruction_ja.strip():
        parts.append(result.segment_i_extra_instruction_ja.strip())
    parts.append("")
    parts.append(normalize_prompt_markup(result.passage.strip()))
    return "\n".join(parts).strip()


def assemble_q4b_model_answer(*, result: Q4BGenerationResult) -> str:
    parts: list[str] = ["■ 解答例"]
    for label in Q4B_BLANK_LABELS:
        ans = next((a for a in result.sample_answers if a.blank_label == label), None)
        if ans:
            parts.append(f"（{label}）{ans.translation_ja.strip()}")
    parts.append("")

    parts.append("■ 採点基準（配点目安）")
    for label in Q4B_BLANK_LABELS:
        analysis = next((a for a in result.segment_analyses if a.blank_label == label), None)
        if not analysis:
            continue
        hint = f"（{analysis.points_hint}）" if analysis.points_hint.strip() else ""
        parts.append(f"・（{label}）の必須要素と減点ポイント{hint}")
        for req in analysis.required_elements_ja:
            parts.append(f"  必須: {req.strip()}")
        for ded in analysis.deduction_points_ja:
            parts.append(f"  減点: {ded.strip()}")
        for fatal in analysis.fatal_mistakes_ja:
            parts.append(f"  致命的: {fatal.strip()}")

    parts.extend(["", "■ 解説"])
    if result.paragraph_summary_ja.strip():
        parts.append("・パラグラフ全体の文脈の簡単な要約")
        parts.append(result.paragraph_summary_ja.strip())
        parts.append("")

    for label in Q4B_BLANK_LABELS:
        analysis = next((a for a in result.segment_analyses if a.blank_label == label), None)
        if not analysis:
            continue
        parts.append(f"・下線部({label})の構文解析と翻訳プロセス")
        if analysis.syntax_tree_ja.strip():
            parts.append(f"  構文: {analysis.syntax_tree_ja.strip()}")
        if analysis.translation_process_ja.strip():
            parts.append(f"  プロセス: {analysis.translation_process_ja.strip()}")

    ng_items = result.bad_translation_examples or []
    if ng_items or result.common_mistakes_ja:
        parts.append("")
        parts.append("・受験生がやりがちな「NGな直訳・誤訳」の例")
        for bad in ng_items:
            prefix = f"（{bad.blank_label}）" if bad.blank_label else ""
            parts.append(f"  {prefix}NG: {bad.ng_translation_ja.strip()}")
            parts.append(f"    理由: {bad.why_wrong_ja.strip()}")
        for m in result.common_mistakes_ja:
            parts.append(f"  - {m.strip()}")

    return "\n".join(parts).strip()


class QuestionQ4BService:
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
        difficulty: str = "standard",
        university_slug: str = "todai",
        reference_years: list[int] | None = None,
    ) -> dict:
        uni_name = self.university_ctx.university_name(university_slug)
        ref_context = self.university_ctx.build_reference_context_for_major(
            teacher_id,
            university_slug,
            major_order=4,
            part_label=Q4B_PART_LABEL,
            reference_years=reference_years,
            limit=3,
            max_chars=6000,
        )
        if not ref_context:
            ref_context = self.university_ctx.build_reference_context_for_major(
                teacher_id,
                university_slug,
                major_order=4,
                part_label=None,
                reference_years=reference_years,
                limit=3,
                max_chars=6000,
            )

        result, validator, retried = self._generate_with_validation(
            topic_hint=topic_hint,
            difficulty=difficulty,
            university_slug=university_slug,
            university_name=uni_name,
            reference_context=ref_context,
            max_attempts=2,
        )

        prompt = assemble_q4b_prompt(result=result)
        model_answer = assemble_q4b_model_answer(result=result)

        return {
            "typeLabel": format_type_label(4, Q4B_PART_LABEL),
            "majorOrder": 4,
            "partLabel": Q4B_PART_LABEL,
            "prompt": prompt,
            "modelAnswer": model_answer,
            "points": Q4B_DEFAULT_POINTS,
            "type": "english",
            "answerFormat": "underline",
            "notes": (
                f"{uni_name} 第4問(B)・下線部和訳パイプライン。"
                f" {result.theme or result.source_note}"
            ),
            "referenceExamples": [],
            "anticipatedMistakes": result.common_mistakes_ja or self._default_anticipated_mistakes(),
            "generationPipeline": "q4b",
            "generationArtifacts": {
                "theme": result.theme,
                "wordCount": result.word_count,
                "instructionJa": result.instruction_ja,
                "segmentIExtraInstructionJa": result.segment_i_extra_instruction_ja,
                "passage": result.passage,
                "underlinedSegments": [s.model_dump(by_alias=True) for s in result.underlined_segments],
                "sampleAnswers": [a.model_dump(by_alias=True) for a in result.sample_answers],
                "paragraphSummaryJa": result.paragraph_summary_ja,
                "segmentAnalyses": [a.model_dump(by_alias=True) for a in result.segment_analyses],
                "badTranslationExamples": [
                    b.model_dump(by_alias=True) for b in result.bad_translation_examples
                ],
                "commonMistakesJa": result.common_mistakes_ja,
                "evaluatorPassed": validator.passed,
                "evaluatorIssues": validator.issues,
                "evaluatorSummary": validator.summary,
                "retriedGeneration": retried,
            },
        }

    def _generate_with_validation(
        self,
        *,
        topic_hint: str,
        difficulty: str,
        university_slug: str,
        university_name: str,
        reference_context: str,
        max_attempts: int,
    ) -> tuple[Q4BGenerationResult, Q4BValidatorResult, bool]:
        retried = False
        validator: Q4BValidatorResult | None = None
        current: Q4BGenerationResult | None = None
        fix_hint = ""

        for attempt in range(max_attempts):
            user_text = build_q4b_generation_user_prompt(
                topic_hint=topic_hint,
                difficulty=difficulty,
                university_name=university_name,
                reference_context=reference_context,
            )
            if fix_hint:
                user_text += f"\n\n【前回の検証で指摘された点を必ず修正】\n{fix_hint}"

            current = self.llm.complete_structured(
                system=build_q4b_generation_system(university_slug, university_name),
                user_text=user_text,
                response_schema=Q4BGenerationResult,
                max_output_tokens=16384,
            )
            current.passage = normalize_prompt_markup(current.passage)

            block = format_q4b_for_validator(current)
            validator = self.llm.complete_structured(
                system=build_q4b_validator_system(university_slug, ""),
                user_text=build_q4b_validator_user_prompt(problem_block=block),
                response_schema=Q4BValidatorResult,
                max_output_tokens=4096,
            )

            structural = self._structural_issues(current)
            all_issues = list(validator.issues) + structural
            if validator.passed and not structural:
                validator.issues = []
                return current, validator, retried

            if attempt >= max_attempts - 1:
                validator.issues = all_issues
                validator.passed = False
                return current, validator, retried

            fix_hint = "; ".join(all_issues) or validator.summary
            retried = True
            logger.info("Q4B validator retry (attempt %s): %s", attempt + 1, fix_hint)

        assert current is not None and validator is not None
        return current, validator, retried

    @staticmethod
    def _structural_issues(result: Q4BGenerationResult) -> list[str]:
        issues: list[str] = []
        passage = result.passage.strip()
        if not passage:
            issues.append("passage が空")

        words = english_word_count(passage)
        if words < 120 or words > 300:
            issues.append(f"英文の語数が目安外（約{words}語。150〜250語程度）")

        if not has_underline_markup(passage):
            issues.append("passage に *...* 下線記法がない")

        spans = count_underline_spans(passage)
        if spans < 2:
            issues.append(f"下線部が2箇所未満（検出{spans}箇所）")

        labels_found = {s.blank_label for s in result.underlined_segments}
        for label in Q4B_BLANK_LABELS:
            if label not in labels_found:
                issues.append(f"underlinedSegments に ({label}) がない")

        if not result.segment_i_extra_instruction_ja.strip():
            issues.append("segmentIExtraInstructionJa（イの特定語指示）が空")
        elif "イ" not in result.segment_i_extra_instruction_ja and "(イ)" not in result.segment_i_extra_instruction_ja:
            issues.append("segmentIExtraInstructionJa に下線部(イ)への言及がない")

        if len(result.sample_answers) != 2:
            issues.append(f"sampleAnswers が2件ではない（{len(result.sample_answers)}件）")

        if len(result.segment_analyses) < 2:
            issues.append("segmentAnalyses が2件未満")
        if not result.paragraph_summary_ja.strip():
            issues.append("paragraphSummaryJa が空")
        if not result.bad_translation_examples:
            issues.append("badTranslationExamples が空")

        return issues

    @staticmethod
    def _default_anticipated_mistakes() -> list[str]:
        return [
            "指示語 it/this/that の指示内容を文脈から特定しない",
            "倒置・名詞構文を直訳調の日本語語順のまま訳す",
            "イの特定語の指示を無視して字面だけ訳す",
        ]

    def generate_and_save_draft(
        self,
        *,
        teacher_id: str,
        university_slug: str | None = None,
        student_id: str | None = None,
        topic_hint: str = "",
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
            "referenceYears": reference_years or [],
            **data,
            "createdAt": now,
            "updatedAt": now,
        }
        _, ref = self._drafts_collection(teacher_id).add(doc)
        return {**data, "id": ref.id, "batchId": batch_id}
