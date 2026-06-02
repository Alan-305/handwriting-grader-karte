"""第2問(A)型（東大・自由英作文）の AI 生成パイプライン。"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.question_generation_q2a import (
    build_q2a_generation_user_prompt,
    build_q2a_validator_user_prompt,
)
from app.ai.prompts.universities.registry import (
    build_q2a_generation_system,
    build_q2a_validator_system,
)
from app.ai.schemas.q2a_generation import (
    Q2A_WORD_MAX,
    Q2A_WORD_MIN,
    Q2AGenerationResult,
    Q2AValidatorResult,
)
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.question_design_service import QuestionDesignService
from app.services.question_type_labels import format_type_label
from app.services.university_context_service import UniversityContextService

logger = logging.getLogger(__name__)

Q2A_DEFAULT_POINTS = 20
Q2A_PART_LABEL = "(A)"


def english_word_count(text: str) -> int:
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text)
    return len(words)


def format_q2a_for_validator(result: Q2AGenerationResult) -> str:
    lines = [
        f"theme: {result.theme}",
        f"questionFormat: {result.question_format}",
        "",
        "questionPrompt:",
        result.question_prompt,
        "",
        "sampleAnswers:",
    ]
    for i, ans in enumerate(result.sample_answers, start=1):
        actual = english_word_count(ans.english)
        lines.append(
            f"  [{i}] {ans.stance_label_ja}: claimed={ans.word_count} actual~{actual}\n"
            f"      {ans.english.strip()}"
        )
    if result.translations_ja:
        lines.extend(["", "translationsJa:"] + [f"  - {t}" for t in result.translations_ja])
    return "\n".join(lines)


def assemble_q2a_prompt(*, result: Q2AGenerationResult) -> str:
    return result.question_prompt.strip()


def assemble_q2a_model_answer(*, result: Q2AGenerationResult) -> str:
    parts: list[str] = ["■ 解答例"]

    for i, ans in enumerate(result.sample_answers[:2], start=1):
        wc = ans.word_count or english_word_count(ans.english)
        parts.append(f"【解答例{i}】（{ans.stance_label_ja.strip()}）")
        parts.append(ans.english.strip())
        parts.append(f"({wc} words)")
        parts.append("")

    if result.translations_ja:
        parts.extend(["■ 和訳"])
        for i, tr in enumerate(result.translations_ja[:2], start=1):
            parts.append(f"【解答例{i}】")
            parts.append(tr.strip())
            parts.append("")

    parts.extend(["■ 採点・解答のポイント（解説）"])
    parts.append("・各解答例の論理構成の解説")
    for ex in sorted(result.answer_explanations, key=lambda x: x.answer_index):
        parts.append(
            f"  【解答例{ex.answer_index}】{ex.logical_structure_ja.strip()}"
        )
        if ex.strengths_ja.strip():
            parts.append(f"    優れている点: {ex.strengths_ja.strip()}")

    if result.useful_expressions:
        parts.append("")
        parts.append("・英作文で使い勝手の良い表現（語彙・構文）")
        for expr in result.useful_expressions:
            parts.append(f"  - {expr.strip()}")

    if result.deduction_points_ja:
        parts.append("")
        parts.append("・減点されやすいポイント（文法以外）")
        for pt in result.deduction_points_ja:
            parts.append(f"  - {pt.strip()}")

    if result.common_mistakes_ja:
        parts.append("")
        parts.append("・受験生が陥りやすいミス")
        for m in result.common_mistakes_ja:
            parts.append(f"  - {m.strip()}")

    return "\n".join(parts).strip()


class QuestionQ2AService:
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
        difficulty: str = "standard",
        university_slug: str = "todai",
        reference_years: list[int] | None = None,
    ) -> dict:
        uni_name = self.university_ctx.university_name(university_slug)
        ref_context = self.university_ctx.build_reference_context_for_major(
            teacher_id,
            university_slug,
            major_order=2,
            part_label=Q2A_PART_LABEL,
            reference_years=reference_years,
            limit=3,
            max_chars=6000,
        )
        if not ref_context:
            ref_context = self.university_ctx.build_reference_context_for_major(
                teacher_id,
                university_slug,
                major_order=2,
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

        prompt = assemble_q2a_prompt(result=result)
        model_answer = assemble_q2a_model_answer(result=result)

        return {
            "typeLabel": format_type_label(2, Q2A_PART_LABEL),
            "majorOrder": 2,
            "partLabel": Q2A_PART_LABEL,
            "prompt": prompt,
            "modelAnswer": model_answer,
            "points": Q2A_DEFAULT_POINTS,
            "type": "english",
            "answerFormat": "essay",
            "notes": (
                f"{uni_name} 第2問(A)・自由英作文パイプライン。"
                f" {result.theme or result.source_note}"
            ),
            "referenceExamples": [],
            "anticipatedMistakes": result.common_mistakes_ja or self._default_anticipated_mistakes(),
            "generationPipeline": "q2a",
            "generationArtifacts": {
                "theme": result.theme,
                "questionFormat": result.question_format,
                "questionPrompt": result.question_prompt,
                "sampleAnswers": [a.model_dump(by_alias=True) for a in result.sample_answers],
                "translationsJa": result.translations_ja,
                "answerExplanations": [
                    e.model_dump(by_alias=True) for e in result.answer_explanations
                ],
                "usefulExpressions": result.useful_expressions,
                "deductionPointsJa": result.deduction_points_ja,
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
    ) -> tuple[Q2AGenerationResult, Q2AValidatorResult, bool]:
        retried = False
        validator: Q2AValidatorResult | None = None
        current: Q2AGenerationResult | None = None
        fix_hint = ""

        for attempt in range(max_attempts):
            user_text = build_q2a_generation_user_prompt(
                topic_hint=topic_hint,
                difficulty=difficulty,
                university_name=university_name,
                reference_context=reference_context,
            )
            if fix_hint:
                user_text += f"\n\n【前回の検証で指摘された点を必ず修正】\n{fix_hint}"

            current = self.gemini.complete_structured(
                system=build_q2a_generation_system(university_slug, university_name),
                user_text=user_text,
                response_schema=Q2AGenerationResult,
                max_output_tokens=16384,
            )

            block = format_q2a_for_validator(current)
            validator = self.gemini.complete_structured(
                system=build_q2a_validator_system(university_slug, ""),
                user_text=build_q2a_validator_user_prompt(problem_block=block),
                response_schema=Q2AValidatorResult,
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
            logger.info("Q2A validator retry (attempt %s): %s", attempt + 1, fix_hint)

        assert current is not None and validator is not None
        return current, validator, retried

    @staticmethod
    def _structural_issues(result: Q2AGenerationResult) -> list[str]:
        issues: list[str] = []
        prompt = result.question_prompt.strip()
        if not prompt:
            issues.append("設問文 questionPrompt が空")
        elif not (
            "60" in prompt
            and ("80" in prompt or "８０" in prompt)
            and ("語" in prompt or "words" in prompt.lower() or "word" in prompt.lower())
        ):
            issues.append("設問に60〜80語の英語作答指示が明示されていない")

        if len(result.sample_answers) != 2:
            issues.append(f"解答例が2つではない（{len(result.sample_answers)}件）")
        for i, ans in enumerate(result.sample_answers, start=1):
            wc = english_word_count(ans.english)
            if wc < Q2A_WORD_MIN or wc > Q2A_WORD_MAX:
                issues.append(
                    f"解答例{i}の語数が60〜80語外（約{wc}語）"
                )
            if ans.word_count and abs(ans.word_count - wc) > 5:
                issues.append(f"解答例{i}の wordCount と実語数が大きく不一致")

        if len(result.translations_ja) < 2:
            issues.append("translationsJa が2件未満")
        if len(result.answer_explanations) < 2:
            issues.append("answerExplanations が2件未満")
        if not result.useful_expressions:
            issues.append("usefulExpressions が空")
        if not result.deduction_points_ja:
            issues.append("deductionPointsJa が空")

        return issues

    @staticmethod
    def _default_anticipated_mistakes() -> list[str]:
        return [
            "語数制限を無視して書きすぎ・書き足りない",
            "主張だけで具体例・理由がなく論理の飛躍になる",
            "And then などの稚拙な接続だけで論理をつなぐ",
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
