"""第1問(A)型（東大・英文要約）の AI 生成パイプライン。"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.question_generation_q1a import (
    build_q1a_generation_user_prompt,
    build_q1a_validator_user_prompt,
)
from app.ai.prompts.universities.registry import (
    build_q1a_generation_system,
    build_q1a_validator_system,
)
from app.ai.schemas.q1a_generation import Q1AGenerationResult, Q1AValidatorResult
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.question_design_service import QuestionDesignService
from app.services.question_type_labels import format_type_label
from app.services.university_context_service import UniversityContextService

logger = logging.getLogger(__name__)

Q1A_DEFAULT_POINTS = 20
Q1A_PART_LABEL = "(A)"
Q1A_CHAR_MIN = 70
Q1A_CHAR_MAX = 80


def ja_char_count(text: str) -> int:
    return len(text.replace("\n", "").strip())


def english_word_count(text: str) -> int:
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text)
    return len(words)


def format_q1a_for_validator(result: Q1AGenerationResult) -> str:
    actual = ja_char_count(result.model_answer_ja)
    words = english_word_count(result.passage)
    lines = [
        f"theme: {result.theme}",
        f"wordCount(claimed): {result.word_count} / actual~{words}",
        f"instructionJa: {result.instruction_ja}",
        f"openingConstraint: {result.opening_constraint}",
        f"modelAnswerJa: {result.model_answer_ja}",
        f"charCount(claimed): {result.char_count} / actual: {actual}",
        "",
        "passage:",
        result.passage,
    ]
    return "\n".join(lines)


def assemble_q1a_prompt(*, result: Q1AGenerationResult) -> str:
    lines: list[str] = []
    if result.instruction_ja.strip():
        lines.append(result.instruction_ja.strip())
    if result.opening_constraint.strip():
        lines.append(result.opening_constraint.strip())
    if lines:
        lines.append("")
    lines.append(result.passage.strip())
    return "\n\n".join(lines).strip()


def assemble_q1a_model_answer(*, result: Q1AGenerationResult) -> str:
    actual = ja_char_count(result.model_answer_ja)
    parts: list[str] = [
        "■ 解答例",
        result.model_answer_ja.strip(),
        f"（{actual}字）",
        "",
        "■ 採点のポイント（必須要素）",
    ]
    for sp in result.scoring_points:
        hint = f" — {sp.points_hint}" if sp.points_hint.strip() else ""
        parts.append(f"・{sp.point_ja.strip()}{hint}")
    parts.extend(["", "■ 解説", "・段落ごとの要旨（パラグラフ・メモ）"])
    for memo in sorted(result.paragraph_memos, key=lambda x: x.paragraph_index):
        parts.append(f"  第{memo.paragraph_index}段落: {memo.summary_ja.strip()}")
    if result.summarization_process_ja.strip():
        parts.extend(
            [
                "",
                "・要約のプロセス（具体例の省略と、抽象化の思考プロセス）",
                result.summarization_process_ja.strip(),
            ]
        )
    if result.common_mistakes_ja:
        parts.append("")
        parts.append("・受験生が陥りやすいミス")
        for m in result.common_mistakes_ja:
            parts.append(f"  - {m.strip()}")
    return "\n".join(parts).strip()


class QuestionQ1AService:
    def __init__(self):
        self.firebase = FirebaseAdminService()
        self.design = QuestionDesignService()
        self.university_ctx = UniversityContextService()
        self.gemini = GeminiAnalysisClient()

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
            major_order=1,
            part_label=Q1A_PART_LABEL,
            reference_years=reference_years,
            limit=3,
            max_chars=6000,
        )
        if not ref_context:
            ref_context = self.university_ctx.build_reference_context_for_major(
                teacher_id,
                university_slug,
                major_order=1,
                part_label=None,
                reference_years=reference_years,
                limit=3,
                max_chars=6000,
            )

        result, validator, retried = self._generate_with_validation(
            topic_hint=topic_hint,
            source_passage=source_passage,
            difficulty=difficulty,
            university_slug=university_slug,
            university_name=uni_name,
            reference_context=ref_context,
            max_attempts=2,
        )

        prompt = assemble_q1a_prompt(result=result)
        model_answer = assemble_q1a_model_answer(result=result)

        return {
            "typeLabel": format_type_label(1, Q1A_PART_LABEL),
            "majorOrder": 1,
            "partLabel": Q1A_PART_LABEL,
            "prompt": prompt,
            "modelAnswer": model_answer,
            "points": Q1A_DEFAULT_POINTS,
            "type": "japanese",
            "answerFormat": "japanese_grid",
            "notes": (
                f"{uni_name} 第1問(A)・英文要約パイプライン。"
                f" {result.theme or result.source_note}"
            ),
            "referenceExamples": [],
            "anticipatedMistakes": result.common_mistakes_ja or self._default_anticipated_mistakes(),
            "generationPipeline": "q1a",
            "generationArtifacts": {
                "theme": result.theme,
                "wordCount": result.word_count,
                "instructionJa": result.instruction_ja,
                "openingConstraint": result.opening_constraint,
                "modelAnswerJa": result.model_answer_ja,
                "charCount": ja_char_count(result.model_answer_ja),
                "scoringPoints": [sp.model_dump(by_alias=True) for sp in result.scoring_points],
                "paragraphMemos": [m.model_dump(by_alias=True) for m in result.paragraph_memos],
                "summarizationProcessJa": result.summarization_process_ja,
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
        source_passage: str,
        difficulty: str,
        university_slug: str,
        university_name: str,
        reference_context: str,
        max_attempts: int,
    ) -> tuple[Q1AGenerationResult, Q1AValidatorResult, bool]:
        retried = False
        validator: Q1AValidatorResult | None = None
        current: Q1AGenerationResult | None = None
        fix_hint = ""

        for attempt in range(max_attempts):
            user_text = build_q1a_generation_user_prompt(
                topic_hint=topic_hint,
                difficulty=difficulty,
                university_name=university_name,
                reference_context=reference_context,
                source_passage=source_passage,
            )
            if fix_hint:
                user_text += f"\n\n【前回の検証で指摘された点を必ず修正】\n{fix_hint}"

            current = self.gemini.complete_structured(
                system=build_q1a_generation_system(university_slug, university_name),
                user_text=user_text,
                response_schema=Q1AGenerationResult,
                max_output_tokens=16384,
            )

            block = format_q1a_for_validator(current)
            validator = self.gemini.complete_structured(
                system=build_q1a_validator_system(university_slug, ""),
                user_text=build_q1a_validator_user_prompt(problem_block=block),
                response_schema=Q1AValidatorResult,
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
            logger.info("Q1A validator retry (attempt %s): %s", attempt + 1, fix_hint)

        assert current is not None and validator is not None
        return current, validator, retried

    @staticmethod
    def _structural_issues(result: Q1AGenerationResult) -> list[str]:
        issues: list[str] = []
        if not result.passage.strip():
            issues.append("英文本文が空")
        words = english_word_count(result.passage)
        if words < 250 or words > 450:
            issues.append(f"英文の語数が目安外（約{words}語。300〜400語程度）")
        if not result.instruction_ja.strip():
            issues.append("設問指示（instructionJa）が空")
        if "70" not in result.instruction_ja and "７０" not in result.instruction_ja:
            issues.append("設問に70〜80字の指定がない")
        chars = ja_char_count(result.model_answer_ja)
        if chars < Q1A_CHAR_MIN or chars > Q1A_CHAR_MAX:
            issues.append(
                f"模範要約が70〜80字ではない（実際{chars}字。句読点含む）"
            )
        if len(result.scoring_points) < 2:
            issues.append("採点ポイントが2個未満")
        return issues

    @staticmethod
    def _default_anticipated_mistakes() -> list[str]:
        return [
            "具体例や枝葉の情報を盛り込みすぎて字数オーバー",
            "筆者の主張（メインアイデア）を取り違える",
            "英文の一部だけを和訳し、全体の論旨を要約できていない",
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
