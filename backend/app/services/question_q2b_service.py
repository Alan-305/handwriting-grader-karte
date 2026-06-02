"""第2問(B)型（東大・和文英訳）の AI 生成パイプライン。"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.question_generation_q2b import (
    build_q2b_generation_user_prompt,
    build_q2b_validator_user_prompt,
)
from app.ai.prompts.universities.registry import (
    build_q2b_generation_system,
    build_q2b_validator_system,
)
from app.ai.schemas.q2b_generation import Q2BGenerationResult, Q2BValidatorResult
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.question_design_service import QuestionDesignService
from app.services.question_prompt_markup import has_underline_markup, normalize_prompt_markup
from app.services.question_type_labels import format_type_label
from app.services.university_context_service import UniversityContextService

logger = logging.getLogger(__name__)

Q2B_DEFAULT_POINTS = 20
Q2B_PART_LABEL = "(B)"

_UNDERLINE_SEGMENT_RE = re.compile(r"\*([^*\n]+)\*")


def count_underline_segments(text: str) -> int:
    return len(_UNDERLINE_SEGMENT_RE.findall(text))


def format_q2b_for_validator(result: Q2BGenerationResult) -> str:
    lines = [
        f"theme: {result.theme}",
        f"genre: {result.genre}",
        f"instructionJa: {result.instruction_ja}",
        f"underlineSegments(counted): {count_underline_segments(result.japanese_passage)}",
        "",
        "japanesePassage:",
        result.japanese_passage,
        "",
        "sampleAnswers:",
    ]
    for i, ans in enumerate(result.sample_answers, start=1):
        lines.append(f"  [{i}] {ans.label_ja}: {ans.english.strip()}")
    if result.bad_literal_translations:
        lines.append("")
        lines.append("badLiteralTranslations:")
        for bad in result.bad_literal_translations:
            lines.append(f"  NG: {bad.ng_english} — {bad.why_wrong_ja}")
    return "\n".join(lines)


def assemble_q2b_prompt(*, result: Q2BGenerationResult) -> str:
    header = result.instruction_ja.strip() or "以下の日本文の下線部を英訳せよ。"
    body = normalize_prompt_markup(result.japanese_passage.strip())
    return f"{header}\n\n{body}".strip()


def assemble_q2b_model_answer(*, result: Q2BGenerationResult) -> str:
    parts: list[str] = ["■ 解答例"]

    for i, ans in enumerate(result.sample_answers[:2], start=1):
        label = ans.label_ja.strip() or f"解答例{i}"
        parts.append(f"【{label}】")
        parts.append(ans.english.strip())
        parts.append("")

    parts.extend(["■ 採点・解答のポイント（解説）"])

    if result.wakuyaku_process_ja.strip():
        parts.append("・和文和訳（意味の変換）のプロセス")
        parts.append(result.wakuyaku_process_ja.strip())
        parts.append("")

    if result.segment_explanations:
        parts.append("・下線部ごとの思考プロセス（直訳の罠と英語的発想）")
        for seg in result.segment_explanations:
            parts.append(f"  「{seg.segment_ja.strip()}」")
            if seg.literal_trap_ja.strip():
                parts.append(f"    直訳の罠: {seg.literal_trap_ja.strip()}")
            if seg.english_thinking_ja.strip():
                parts.append(f"    英語的発想: {seg.english_thinking_ja.strip()}")

    if result.grammar_essentials_ja:
        parts.append("")
        parts.append("・必須となる文法・構文要素（時制、冠詞、態の選択など）")
        for g in result.grammar_essentials_ja:
            parts.append(f"  - {g.strip()}")

    if result.bad_literal_translations:
        parts.append("")
        parts.append("・受験生が陥りやすいミス（NG訳の例とその理由）")
        for bad in result.bad_literal_translations:
            parts.append(f"  NG: {bad.ng_english.strip()}")
            parts.append(f"    理由: {bad.why_wrong_ja.strip()}")
            if bad.suggested_rephrase_ja.strip():
                parts.append(f"    言い換えの目安: {bad.suggested_rephrase_ja.strip()}")

    if result.common_mistakes_ja:
        parts.append("")
        parts.append("・その他の典型ミス")
        for m in result.common_mistakes_ja:
            parts.append(f"  - {m.strip()}")

    return "\n".join(parts).strip()


class QuestionQ2BService:
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
            part_label=Q2B_PART_LABEL,
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

        prompt = assemble_q2b_prompt(result=result)
        model_answer = assemble_q2b_model_answer(result=result)

        return {
            "typeLabel": format_type_label(2, Q2B_PART_LABEL),
            "majorOrder": 2,
            "partLabel": Q2B_PART_LABEL,
            "prompt": prompt,
            "modelAnswer": model_answer,
            "points": Q2B_DEFAULT_POINTS,
            "type": "japanese",
            "answerFormat": "underline",
            "notes": (
                f"{uni_name} 第2問(B)・和文英訳パイプライン。"
                f" {result.theme or result.source_note}"
            ),
            "referenceExamples": [],
            "anticipatedMistakes": result.common_mistakes_ja or self._default_anticipated_mistakes(),
            "generationPipeline": "q2b",
            "generationArtifacts": {
                "theme": result.theme,
                "genre": result.genre,
                "instructionJa": result.instruction_ja,
                "japanesePassage": result.japanese_passage,
                "underlinedSegmentsJa": result.underlined_segments_ja,
                "sampleAnswers": [a.model_dump(by_alias=True) for a in result.sample_answers],
                "wakuyakuProcessJa": result.wakuyaku_process_ja,
                "grammarEssentialsJa": result.grammar_essentials_ja,
                "segmentExplanations": [
                    s.model_dump(by_alias=True) for s in result.segment_explanations
                ],
                "badLiteralTranslations": [
                    b.model_dump(by_alias=True) for b in result.bad_literal_translations
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
    ) -> tuple[Q2BGenerationResult, Q2BValidatorResult, bool]:
        retried = False
        validator: Q2BValidatorResult | None = None
        current: Q2BGenerationResult | None = None
        fix_hint = ""

        for attempt in range(max_attempts):
            user_text = build_q2b_generation_user_prompt(
                topic_hint=topic_hint,
                difficulty=difficulty,
                university_name=university_name,
                reference_context=reference_context,
            )
            if fix_hint:
                user_text += f"\n\n【前回の検証で指摘された点を必ず修正】\n{fix_hint}"

            current = self.gemini.complete_structured(
                system=build_q2b_generation_system(university_slug, university_name),
                user_text=user_text,
                response_schema=Q2BGenerationResult,
                max_output_tokens=16384,
            )
            current.japanese_passage = normalize_prompt_markup(current.japanese_passage)

            block = format_q2b_for_validator(current)
            validator = self.gemini.complete_structured(
                system=build_q2b_validator_system(university_slug, ""),
                user_text=build_q2b_validator_user_prompt(problem_block=block),
                response_schema=Q2BValidatorResult,
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
            logger.info("Q2B validator retry (attempt %s): %s", attempt + 1, fix_hint)

        assert current is not None and validator is not None
        return current, validator, retried

    @staticmethod
    def _structural_issues(result: Q2BGenerationResult) -> list[str]:
        issues: list[str] = []
        passage = result.japanese_passage.strip()
        if not passage:
            issues.append("japanesePassage が空")

        if not has_underline_markup(passage):
            issues.append("japanesePassage に *...* 下線記法がない")

        seg_count = count_underline_segments(passage)
        if seg_count < 1:
            issues.append("英訳対象の下線部が検出できない")
        elif seg_count > 5:
            issues.append(f"下線部が多すぎる（{seg_count}箇所。2〜3文程度に収める）")

        inst = result.instruction_ja.strip()
        if inst and "下線" not in inst and "英訳" not in inst:
            issues.append("instructionJa に下線部英訳の指示がない")

        if len(result.sample_answers) != 2:
            issues.append(f"解答例が2つではない（{len(result.sample_answers)}件）")
        approaches = {a.approach for a in result.sample_answers}
        if len(result.sample_answers) == 2 and len(approaches) < 2:
            labels = [a.label_ja for a in result.sample_answers]
            if not (any("平易" in lb or "パラフレーズ" in lb for lb in labels)):
                issues.append("解答例2が平易なパラフレーズ型になっていない可能性")

        for i, ans in enumerate(result.sample_answers, start=1):
            if not ans.english.strip():
                issues.append(f"解答例{i}の english が空")

        if not result.bad_literal_translations:
            issues.append("badLiteralTranslations（NG直訳例）が空")
        if not result.wakuyaku_process_ja.strip() and not result.segment_explanations:
            issues.append("和文和訳のプロセス解説が不足")
        if not result.grammar_essentials_ja:
            issues.append("grammarEssentialsJa が空")

        return issues

    @staticmethod
    def _default_anticipated_mistakes() -> list[str]:
        return [
            "日本語の字面をそのまま英語に置き換える直訳",
            "比喩・慣用句のイメージを無視して語を並べる",
            "主語・目的語の省略を補わずに不完全な英文にする",
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
