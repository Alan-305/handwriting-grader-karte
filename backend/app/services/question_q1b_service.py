"""第1問(B)型（東大・文脈把握・空所補充＋語句並べ替え）の AI 生成パイプライン。"""

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
    Q1B_CHOICE_LABELS,
    Q1B_PART_A_BLANK_LABELS,
    Q1B_PART_I_BLANK_LABEL,
    Q1B_PART_I_MAX_WORDS,
    Q1B_PART_I_MIN_WORDS,
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


def _blank_present(passage: str, label: str) -> bool:
    return f"({label})" in passage or f"（{label}）" in passage


def format_q1b_for_validator(result: Q1BGenerationResult) -> str:
    part_a = result.part_a
    part_i = result.part_i
    words_a = english_word_count(part_a.passage)
    words_i = english_word_count(part_i.passage)
    lines = [
        f"theme: {result.theme}",
        f"instructionsJa: {result.instructions_ja}",
        "",
        "=== 小問（ア） ===",
        f"wordCount(claimed): {part_a.word_count} / actual~{words_a}",
        f"instructionsJa: {part_a.instructions_ja}",
        f"dummyChoiceLabel: {part_a.dummy_choice_label}",
        "",
        "passage:",
        part_a.passage,
        "",
        "choices:",
    ]
    for ch in sorted(part_a.choices, key=lambda x: _normalize_choice_label(x.label)):
        mark = " [DUMMY]" if ch.is_dummy else ""
        lines.append(f"  {ch.label}) {ch.text.strip()}{mark}")
    lines.append("")
    lines.append("answers:")
    for ans in part_a.answers:
        lines.append(f"  ({ans.blank_label}): {ans.correct_choice}")
    lines.extend(
        [
            "",
            "=== 小問（イ） ===",
            f"wordCount(claimed): {part_i.word_count} / actual~{words_i}",
            f"instructionsJa: {part_i.instructions_ja}",
            "",
            "passage:",
            part_i.passage,
            "",
            "wordBank:",
        ]
    )
    for i, w in enumerate(part_i.word_bank, 1):
        lines.append(f"  {i}. {w.strip()}")
    lines.append("")
    lines.append(f"correctOrder: {' / '.join(part_i.correct_order)}")
    lines.append(f"correctExpressionEn: {part_i.correct_expression_en}")
    lines.append(f"explanationJa: {part_i.explanation_ja}")
    return "\n".join(lines)


def assemble_q1b_prompt(*, result: Q1BGenerationResult) -> str:
    lines: list[str] = []
    if result.instructions_ja.strip():
        lines.append(result.instructions_ja.strip())
        lines.append("")

    part_a = result.part_a
    lines.append("（ア）")
    if part_a.instructions_ja.strip():
        lines.append(part_a.instructions_ja.strip())
    lines.append(part_a.passage.strip())
    lines.append("")
    lines.append("【選択肢】")
    for ch in sorted(part_a.choices, key=lambda x: _normalize_choice_label(x.label)):
        label = ch.label.strip().rstrip(")")
        lines.append(f"{label}) {ch.text.strip()}")

    part_i = result.part_i
    lines.extend(["", "（イ）"])
    if part_i.instructions_ja.strip():
        lines.append(part_i.instructions_ja.strip())
    lines.append(part_i.passage.strip())
    if part_i.word_bank:
        lines.append("")
        lines.append("【並べ替える語句】")
        lines.append(" / ".join(w.strip() for w in part_i.word_bank))
    return "\n".join(lines).strip()


def assemble_q1b_model_answer(*, result: Q1BGenerationResult) -> str:
    part_a = result.part_a
    part_i = result.part_i
    parts: list[str] = ["■ 小問（ア） 選択肢 a) ～ f)"]
    for ch in sorted(part_a.choices, key=lambda x: _normalize_choice_label(x.label)):
        label = ch.label.strip().rstrip(")")
        dummy = "（ダミー）" if ch.is_dummy else ""
        parts.append(f"{label}) {ch.text.strip()}{dummy}")

    parts.extend(["", "■ 小問（ア） 解答"])
    for label in Q1B_PART_A_BLANK_LABELS:
        match = next((a for a in part_a.answers if a.blank_label == label), None)
        sym = match.correct_choice.strip().lower() if match else "?"
        parts.append(f"({label})：{sym}")

    parts.extend(["", "■ 小問（ア） 解説"])
    for ex in sorted(
        part_a.blank_explanations,
        key=lambda x: (
            Q1B_PART_A_BLANK_LABELS.index(x.blank_label)
            if x.blank_label in Q1B_PART_A_BLANK_LABELS
            else 99
        ),
    ):
        note = f"（{ex.discourse_note}）" if ex.discourse_note.strip() else ""
        parts.append(
            f"  ({ex.blank_label})→ {ex.correct_choice}: {ex.rationale_ja.strip()}{note}"
        )

    if part_a.dummy_explanations:
        parts.append("")
        parts.append("・ダミー選択肢が不正解となる理由")
        for d in part_a.dummy_explanations:
            parts.append(f"  {d.choice_label}): {d.why_wrong_ja.strip()}")

    parts.extend(["", "■ 小問（イ） 解答"])
    if part_i.correct_expression_en.strip():
        parts.append(part_i.correct_expression_en.strip())
    elif part_i.correct_order:
        parts.append(" / ".join(w.strip() for w in part_i.correct_order))
    else:
        parts.append("（未設定）")

    parts.extend(["", "■ 小問（イ） 解説"])
    if part_i.explanation_ja.strip():
        parts.append(part_i.explanation_ja.strip())
    if part_i.structure_note_ja.strip():
        parts.append(f"構造: {part_i.structure_note_ja.strip()}")

    parts.extend(["", "■ 全体のポイント"])
    if result.overall_summary_ja.strip():
        parts.append(result.overall_summary_ja.strip())

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
                f"{uni_name} 第1問(B)・空所補充＋語句並べ替えパイプライン。"
                f" {result.theme or result.source_note}"
            ),
            "referenceExamples": [],
            "anticipatedMistakes": result.common_mistakes_ja or self._default_anticipated_mistakes(),
            "generationPipeline": "q1b",
            "generationArtifacts": {
                "theme": result.theme,
                "instructionsJa": result.instructions_ja,
                "partA": result.part_a.model_dump(by_alias=True),
                "partI": result.part_i.model_dump(by_alias=True),
                "overallSummaryJa": result.overall_summary_ja,
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
        part_a = result.part_a
        part_i = result.part_i

        if not part_a.passage.strip():
            issues.append("小問（ア）の英文本文が空")
        words_a = english_word_count(part_a.passage)
        if words_a < 400 or words_a > 700:
            issues.append(
                f"小問（ア）の語数が目安外（約{words_a}語。500〜600語程度）"
            )

        for label in Q1B_PART_A_BLANK_LABELS:
            if not _blank_present(part_a.passage, label):
                issues.append(f"小問（ア）passage に空所 ({label}) がない")

        if len(part_a.choices) != 6:
            issues.append(f"小問（ア）の選択肢が6つではない（{len(part_a.choices)}個）")
        dummies = [c for c in part_a.choices if c.is_dummy]
        if len(dummies) != 1:
            issues.append(f"小問（ア）のダミー選択肢が1つではない（{len(dummies)}個）")
        if part_a.dummy_choice_label.strip():
            dummy_norm = _normalize_choice_label(part_a.dummy_choice_label)
            if not any(
                _normalize_choice_label(c.label) == dummy_norm and c.is_dummy
                for c in part_a.choices
            ):
                issues.append("dummyChoiceLabel と isDummy の選択肢が一致しない")

        choice_labels = {_normalize_choice_label(c.label) for c in part_a.choices}
        if choice_labels != set(Q1B_CHOICE_LABELS):
            issues.append("小問（ア）の選択肢ラベルが a〜f で揃っていない")

        if len(part_a.answers) != 5:
            issues.append(f"小問（ア）answers が5件ではない（{len(part_a.answers)}件）")

        used_choices: list[str] = []
        for ans in part_a.answers:
            if ans.blank_label not in Q1B_PART_A_BLANK_LABELS:
                issues.append(f"不正な空所ラベル: {ans.blank_label}")
            norm = _normalize_choice_label(ans.correct_choice)
            if norm not in choice_labels:
                issues.append(
                    f"空所({ans.blank_label})の正解記号が選択肢にない: {ans.correct_choice}"
                )
            if norm == _normalize_choice_label(part_a.dummy_choice_label):
                issues.append(f"空所({ans.blank_label})の正解がダミーになっている")
            used_choices.append(norm)

        if len(used_choices) == 5 and len(set(used_choices)) != 5:
            issues.append("小問（ア）で同じ選択肢記号が複数の空所に使われている（各記号1回のみ）")

        if len(part_a.blank_explanations) < 5:
            issues.append("小問（ア）blankExplanations が5件未満")
        if not part_a.dummy_explanations:
            issues.append("小問（ア）dummyExplanations が空")

        if not part_i.passage.strip():
            issues.append("小問（イ）の英文本文が空")
        if not _blank_present(part_i.passage, Q1B_PART_I_BLANK_LABEL):
            issues.append("小問（イ）passage に空所 (イ) がない")

        bank_count = len(part_i.word_bank)
        if bank_count < Q1B_PART_I_MIN_WORDS or bank_count > Q1B_PART_I_MAX_WORDS:
            issues.append(
                f"小問（イ）wordBank が{bank_count}個 "
                f"（{Q1B_PART_I_MIN_WORDS}〜{Q1B_PART_I_MAX_WORDS}個にすること）"
            )

        if len(part_i.correct_order) != bank_count and bank_count > 0:
            issues.append("小問（イ）correctOrder の件数が wordBank と一致しない")

        if bank_count > 0 and part_i.correct_order:
            bank_norm = {w.strip().lower() for w in part_i.word_bank}
            order_norm = {w.strip().lower() for w in part_i.correct_order}
            if bank_norm != order_norm:
                issues.append("小問（イ）correctOrder が wordBank と一致しない")

        if not part_i.correct_expression_en.strip() and not part_i.correct_order:
            issues.append("小問（イ）の正解（correctExpressionEn または correctOrder）が空")
        if not part_i.explanation_ja.strip():
            issues.append("小問（イ）explanationJa が空")

        return issues

    @staticmethod
    def _default_anticipated_mistakes() -> list[str]:
        return [
            "（ア）本文中のキーワードだけで選択し、接続詞・指示語の論理を読まない",
            "（ア）同じ選択肢記号を複数の空所に使ってしまう",
            "（イ）語句の並べ順だけでなく、句・節の構造と意味のつながりを確認しない",
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
