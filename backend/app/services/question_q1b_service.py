"""第1問(B)型（東大・文脈把握・空所補充）の AI 生成パイプライン。"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.question_generation_q1b import (
    build_q1b_generation_user_prompt,
    build_q1b_validator_user_prompt,
)
from app.ai.prompts.universities.registry import (
    build_q1b_generation_system,
    build_q1b_validator_system,
)
from app.ai.schemas.q1b_generation import (
    Q1B_BLANK_LABELS,
    Q1B_CHOICE_LABELS,
    Q1BGenerationResult,
    Q1BValidatorResult,
)
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.question_design_service import QuestionDesignService
from app.services.question_type_labels import format_type_label
from app.services.university_context_service import UniversityContextService

logger = logging.getLogger(__name__)

Q1B_DEFAULT_POINTS = 25
Q1B_PART_LABEL = "(B)"


def english_word_count(text: str) -> int:
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text)
    return len(words)


def _normalize_choice_label(label: str) -> str:
    return label.strip().lower().rstrip(")")


def format_q1b_for_validator(result: Q1BGenerationResult) -> str:
    words = english_word_count(result.passage)
    lines = [
        f"theme: {result.theme}",
        f"wordCount(claimed): {result.word_count} / actual~{words}",
        f"instructionsJa: {result.instructions_ja}",
        f"dummyChoiceLabel: {result.dummy_choice_label}",
        "",
        "passage:",
        result.passage,
        "",
        "choices:",
    ]
    for ch in sorted(result.choices, key=lambda x: _normalize_choice_label(x.label)):
        mark = " [DUMMY]" if ch.is_dummy else ""
        lines.append(f"  {ch.label}) {ch.text.strip()}{mark}")
    lines.append("")
    lines.append("answers:")
    for ans in result.answers:
        lines.append(f"  ({ans.blank_label}): {ans.correct_choice}")
    return "\n".join(lines)


def assemble_q1b_prompt(*, result: Q1BGenerationResult) -> str:
    lines: list[str] = []
    if result.instructions_ja.strip():
        lines.append(result.instructions_ja.strip())
        lines.append("")
    lines.append(result.passage.strip())
    lines.append("")
    lines.append("【選択肢】")
    for ch in sorted(result.choices, key=lambda x: _normalize_choice_label(x.label)):
        label = ch.label.strip().rstrip(")")
        lines.append(f"{label}) {ch.text.strip()}")
    return "\n".join(lines).strip()


def assemble_q1b_model_answer(*, result: Q1BGenerationResult) -> str:
    parts: list[str] = ["■ 選択肢 a) ～ f)"]
    for ch in sorted(result.choices, key=lambda x: _normalize_choice_label(x.label)):
        label = ch.label.strip().rstrip(")")
        dummy = "（ダミー）" if ch.is_dummy else ""
        parts.append(f"{label}) {ch.text.strip()}{dummy}")

    parts.extend(["", "■ 解答"])
    for label in Q1B_BLANK_LABELS:
        match = next((a for a in result.answers if a.blank_label == label), None)
        sym = match.correct_choice.strip().lower() if match else "?"
        parts.append(f"（{label}）：{sym}")

    parts.extend(["", "■ 採点・解答のポイント（解説）"])
    if result.overall_summary_ja.strip():
        parts.extend(["・全体の論旨（簡単な要約）", result.overall_summary_ja.strip(), ""])

    parts.append("・各空所の正解の根拠")
    for ex in sorted(result.blank_explanations, key=lambda x: Q1B_BLANK_LABELS.index(x.blank_label) if x.blank_label in Q1B_BLANK_LABELS else 99):
        note = f"（{ex.discourse_note}）" if ex.discourse_note.strip() else ""
        parts.append(
            f"  （{ex.blank_label}）→ {ex.correct_choice}: {ex.rationale_ja.strip()}{note}"
        )

    if result.dummy_explanations:
        parts.append("")
        parts.append("・ダミー選択肢が不正解となる理由")
        for d in result.dummy_explanations:
            parts.append(f"  {d.choice_label}): {d.why_wrong_ja.strip()}")

    if result.common_mistakes_ja:
        parts.append("")
        parts.append("・受験生が陥りやすいミス")
        for m in result.common_mistakes_ja:
            parts.append(f"  - {m.strip()}")

    return "\n".join(parts).strip()


class QuestionQ1BService:
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
            part_label=Q1B_PART_LABEL,
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

        prompt = assemble_q1b_prompt(result=result)
        model_answer = assemble_q1b_model_answer(result=result)

        return {
            "typeLabel": format_type_label(1, Q1B_PART_LABEL),
            "majorOrder": 1,
            "partLabel": Q1B_PART_LABEL,
            "prompt": prompt,
            "modelAnswer": model_answer,
            "points": Q1B_DEFAULT_POINTS,
            "type": "english",
            "answerFormat": "short",
            "notes": (
                f"{uni_name} 第1問(B)・空所補充パイプライン。"
                f" {result.theme or result.source_note}"
            ),
            "referenceExamples": [],
            "anticipatedMistakes": result.common_mistakes_ja or self._default_anticipated_mistakes(),
            "generationPipeline": "q1b",
            "generationArtifacts": {
                "theme": result.theme,
                "wordCount": result.word_count,
                "instructionsJa": result.instructions_ja,
                "dummyChoiceLabel": result.dummy_choice_label,
                "choices": [c.model_dump(by_alias=True) for c in result.choices],
                "answers": [a.model_dump(by_alias=True) for a in result.answers],
                "overallSummaryJa": result.overall_summary_ja,
                "blankExplanations": [e.model_dump(by_alias=True) for e in result.blank_explanations],
                "dummyExplanations": [d.model_dump(by_alias=True) for d in result.dummy_explanations],
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
    ) -> tuple[Q1BGenerationResult, Q1BValidatorResult, bool]:
        retried = False
        validator: Q1BValidatorResult | None = None
        current: Q1BGenerationResult | None = None
        fix_hint = ""

        for attempt in range(max_attempts):
            user_text = build_q1b_generation_user_prompt(
                topic_hint=topic_hint,
                difficulty=difficulty,
                university_name=university_name,
                reference_context=reference_context,
                source_passage=source_passage,
            )
            if fix_hint:
                user_text += f"\n\n【前回の検証で指摘された点を必ず修正】\n{fix_hint}"

            current = self.gemini.complete_structured(
                system=build_q1b_generation_system(university_slug, university_name),
                user_text=user_text,
                response_schema=Q1BGenerationResult,
                max_output_tokens=16384,
            )

            block = format_q1b_for_validator(current)
            validator = self.gemini.complete_structured(
                system=build_q1b_validator_system(university_slug, ""),
                user_text=build_q1b_validator_user_prompt(problem_block=block),
                response_schema=Q1BValidatorResult,
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
            logger.info("Q1B validator retry (attempt %s): %s", attempt + 1, fix_hint)

        assert current is not None and validator is not None
        return current, validator, retried

    @staticmethod
    def _structural_issues(result: Q1BGenerationResult) -> list[str]:
        issues: list[str] = []
        if not result.passage.strip():
            issues.append("英文本文が空")
        words = english_word_count(result.passage)
        if words < 400 or words > 700:
            issues.append(f"英文の語数が目安外（約{words}語。500〜600語程度）")

        for label in Q1B_BLANK_LABELS:
            if f"({label})" not in result.passage and f"（{label}）" not in result.passage:
                issues.append(f"passage に空所 ({label}) がない")

        if len(result.choices) != 6:
            issues.append(f"選択肢が6つではない（{len(result.choices)}個）")
        dummies = [c for c in result.choices if c.is_dummy]
        if len(dummies) != 1:
            issues.append(f"ダミー選択肢が1つではない（{len(dummies)}個）")
        if result.dummy_choice_label.strip():
            dummy_norm = _normalize_choice_label(result.dummy_choice_label)
            if not any(_normalize_choice_label(c.label) == dummy_norm and c.is_dummy for c in result.choices):
                issues.append("dummyChoiceLabel と isDummy の選択肢が一致しない")

        choice_labels = {_normalize_choice_label(c.label) for c in result.choices}
        if choice_labels != set(Q1B_CHOICE_LABELS):
            issues.append("選択肢ラベルが a〜f で揃っていない")

        if len(result.answers) != 5:
            issues.append(f"answers が5件ではない（{len(result.answers)}件）")
        for ans in result.answers:
            if ans.blank_label not in Q1B_BLANK_LABELS:
                issues.append(f"不正な空所ラベル: {ans.blank_label}")
            norm = _normalize_choice_label(ans.correct_choice)
            if norm not in choice_labels:
                issues.append(f"空所({ans.blank_label})の正解記号が選択肢にない: {ans.correct_choice}")
            if norm == _normalize_choice_label(result.dummy_choice_label):
                issues.append(f"空所({ans.blank_label})の正解がダミーになっている")

        if len(result.blank_explanations) < 5:
            issues.append("blankExplanations が5件未満")
        if not result.dummy_explanations:
            issues.append("dummyExplanations が空")

        return issues

    @staticmethod
    def _default_anticipated_mistakes() -> list[str]:
        return [
            "本文中のキーワードだけで選択し、接続詞・指示語の論理を読まない",
            "ダミー選択肢を、語彙の類似だけで除外できない",
            "空所前後の因果・逆接・対比の関係を無視して選ぶ",
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
