"""第2問型（読解総合）の AI 生成パイプライン。"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.question_generation_q2 import (
    build_q2_generation_user_prompt,
    build_q2_validator_user_prompt,
)
from app.ai.prompts.universities.registry import (
    build_q2_generation_system,
    build_q2_validator_system,
)
from app.ai.schemas.q2_comprehensive_generation import (
    Q2ComprehensiveGenerationResult,
    Q2ComprehensiveValidatorResult,
)
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.question_design_service import QuestionDesignService
from app.services.question_prompt_markup import normalize_prompt_markup
from app.services.question_type_labels import format_type_label
from app.services.university_context_service import UniversityContextService

logger = logging.getLogger(__name__)

Q2_DEFAULT_POINTS = 50
Q2_WORD_MIN = 1000
Q2_WORD_MAX = 1200
Q2_ESSAY_WORD_MIN = 80


def english_word_count(text: str) -> int:
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text)
    return len(words)


def ja_char_count(text: str) -> int:
    return len(text.replace("\n", "").strip())


def format_q2_for_validator(result: Q2ComprehensiveGenerationResult) -> str:
    passage = result.passage_for_exam or "\n\n".join(
        f"({p.paragraph_index}) {p.text.strip()}" for p in result.numbered_paragraphs
    )
    words = english_word_count(passage)
    lines = [
        f"theme: {result.theme}",
        f"wordCount(claimed): {result.word_count} / actual~{words}",
        f"instructionsJa: {result.instructions_ja}",
        f"idiomQuestions: {len(result.idiom_questions)}",
        f"clozeBlanks: {len(result.cloze_blanks)}",
        f"essayAnswerExamples: {len(result.essay_answer_examples)}",
        "",
        "passageForExam:",
        passage,
        "",
        f"comprehensionPromptJa: {result.comprehension_prompt_ja}",
        f"truthPromptJa: {result.truth_prompt_ja}",
        f"truthChoices (English): {[c.text for c in result.truth_choices]}",
        f"interpretationPromptJa: {result.interpretation_prompt_ja}",
        f"essayPromptJa: {result.essay_prompt_ja}",
        f"passageSummaryJa: {result.passage_summary_ja}",
    ]
    return "\n".join(lines)


def assemble_q2_prompt(*, result: Q2ComprehensiveGenerationResult) -> str:
    header = result.instructions_ja.strip() or "次の英文を読み、下の問いに答えなさい。"
    body = result.passage_for_exam.strip()
    if not body and result.numbered_paragraphs:
        body = "\n\n".join(
            f"({p.paragraph_index}) {p.text.strip()}" for p in result.numbered_paragraphs
        )

    parts = [header, "", body, ""]

    parts.append("問1")
    parts.append(result.comprehension_prompt_ja.strip())
    if result.comprehension_target.strip():
        parts.append(f"【対象】 {result.comprehension_target.strip()}")
    if result.comprehension_paragraph_index:
        parts.append(f"（第{result.comprehension_paragraph_index}段落）")
    if result.comprehension_char_limit_ja:
        parts.append(f"（{result.comprehension_char_limit_ja}字以内の日本語で答えよ）")
    parts.append("")

    parts.append("問2")
    for i, iq in enumerate(result.idiom_questions, 1):
        parts.append(f"({i}) {iq.prompt_ja.strip() or '下線部の意味として最も適当なものを1つ選べ。'}")
        if iq.underlined_text.strip():
            parts.append(f"下線部: *{iq.underlined_text.strip()}*")
        for ch in iq.choices:
            parts.append(f"  {ch.label}. {ch.text.strip()}")
    if not result.idiom_questions:
        parts.append("文脈から句動詞またはイディオムの意味を選べ。")
    parts.append("")

    parts.append("問3")
    parts.append(result.truth_prompt_ja.strip() or "次の記述のうち、本文の内容と一致するものを1つ選べ。")
    for ch in result.truth_choices:
        parts.append(f"  {ch.label}. {ch.text.strip()}")
    parts.append("")

    parts.append("問4")
    parts.append(result.interpretation_prompt_ja.strip())
    if result.interpretation_target.strip():
        parts.append(f"【対象】 {result.interpretation_target.strip()}")
    if result.interpretation_char_limit_ja:
        parts.append(f"（{result.interpretation_char_limit_ja}字以内の日本語で答えよ）")
    parts.append("")

    parts.append("問5")
    parts.append(result.cloze_prompt_ja.strip() or "次の空所に入る最も適当なものを選べ。")
    for blank in result.cloze_blanks:
        parts.append(f"空所 {blank.blank_label}")
        for ch in blank.choices:
            parts.append(f"  {ch.label}. {ch.text.strip()}")
    parts.append("")

    parts.append("問6")
    parts.append(result.essay_prompt_ja.strip())
    if result.essay_word_min:
        parts.append(f"（{result.essay_word_min}語以上の英語で答えよ）")

    return normalize_prompt_markup("\n".join(parts).strip())


def assemble_q2_model_answer(*, result: Q2ComprehensiveGenerationResult) -> str:
    parts: list[str] = ["■ 解答例", ""]

    parts.append("【問1】")
    parts.append(result.model_answer_comprehension_ja.strip())
    if result.comprehension_rationale_ja.strip():
        parts.append(result.comprehension_rationale_ja.strip())
    parts.append("")

    parts.append("【問2】")
    for i, iq in enumerate(result.idiom_questions, 1):
        parts.append(f"({i}) {iq.correct_label.upper()} — {iq.explanation_ja.strip()}")
    parts.append("")

    parts.append("【問3】")
    parts.append(f"{result.truth_correct_label.upper()} — {result.truth_rationale_ja.strip()}")
    parts.append("")

    parts.append("【問4】")
    parts.append(result.model_answer_interpretation_ja.strip())
    if result.interpretation_rationale_ja.strip():
        parts.append(result.interpretation_rationale_ja.strip())
    parts.append("")

    parts.append("【問5】")
    for blank in result.cloze_blanks:
        parts.append(f"{blank.blank_label} {blank.correct_label.upper()} — {blank.explanation_ja.strip()}")
    parts.append("")

    parts.append("【問6】")
    for ex in result.essay_answer_examples:
        label = ex.stance_label.strip() or "解答例"
        words = english_word_count(ex.answer_en)
        parts.append(f"◆ {label}（約{words}語）")
        parts.append(ex.answer_en.strip())
        if ex.explanation_ja.strip():
            parts.append(ex.explanation_ja.strip())
        parts.append("")

    parts.append("■ 解説")
    parts.append("【長文の要約】")
    parts.append(result.passage_summary_ja.strip())

    if result.common_mistakes_ja:
        parts.append("")
        parts.append("【受験生が陥りやすいミス】")
        for m in result.common_mistakes_ja:
            parts.append(f"・{m.strip()}")

    return "\n".join(parts).strip()


class QuestionQ2Service:
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
        university_slug: str = "sapporo-med",
        reference_years: list[int] | None = None,
    ) -> dict:
        uni_name = self.university_ctx.university_name(university_slug)
        ref_context = self.university_ctx.build_reference_context_for_major(
            teacher_id,
            university_slug,
            major_order=2,
            part_label=None,
            reference_years=reference_years,
            limit=3,
            max_chars=8000,
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

        prompt = assemble_q2_prompt(result=result)
        model_answer = assemble_q2_model_answer(result=result)

        return {
            "typeLabel": format_type_label(2, None),
            "majorOrder": 2,
            "partLabel": None,
            "prompt": prompt,
            "modelAnswer": model_answer,
            "points": Q2_DEFAULT_POINTS,
            "type": "english",
            "answerFormat": "composite",
            "notes": (
                f"{uni_name} 第2問（読解総合）パイプライン。"
                f" {result.theme or 'オリジナル模試'}"
            ),
            "referenceExamples": [],
            "anticipatedMistakes": result.common_mistakes_ja or self._default_anticipated_mistakes(),
            "generationPipeline": "q2",
            "generationArtifacts": {
                "theme": result.theme,
                "wordCount": result.word_count,
                "instructionsJa": result.instructions_ja,
                "passageForExam": result.passage_for_exam,
                "numberedParagraphs": [
                    p.model_dump(by_alias=True) for p in result.numbered_paragraphs
                ],
                "idiomQuestions": [iq.model_dump(by_alias=True) for iq in result.idiom_questions],
                "truthCorrectLabel": result.truth_correct_label,
                "clozeBlanks": [b.model_dump(by_alias=True) for b in result.cloze_blanks],
                "essayAnswerExamples": [
                    ex.model_dump(by_alias=True) for ex in result.essay_answer_examples
                ],
                "evaluatorPassed": validator.passed,
                "evaluatorIssues": validator.issues,
                "evaluatorSummary": validator.summary,
                "retriedGeneration": retried,
                "passageSummaryJa": result.passage_summary_ja,
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
    ) -> tuple[Q2ComprehensiveGenerationResult, Q2ComprehensiveValidatorResult, bool]:
        retried = False
        validator: Q2ComprehensiveValidatorResult | None = None
        current: Q2ComprehensiveGenerationResult | None = None
        fix_hint = ""

        for attempt in range(max_attempts):
            user_text = build_q2_generation_user_prompt(
                topic_hint=topic_hint,
                difficulty=difficulty,
                university_name=university_name,
                reference_context=reference_context,
                source_passage=source_passage,
            )
            if fix_hint:
                user_text += f"\n\n【前回の検証で指摘された点を必ず修正】\n{fix_hint}"

            current = self.gemini.complete_structured(
                system=build_q2_generation_system(university_slug, university_name),
                user_text=user_text,
                response_schema=Q2ComprehensiveGenerationResult,
                max_output_tokens=28672,
            )

            block = format_q2_for_validator(current)
            validator = self.gemini.complete_structured(
                system=build_q2_validator_system(university_slug, university_name),
                user_text=build_q2_validator_user_prompt(problem_block=block),
                response_schema=Q2ComprehensiveValidatorResult,
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
            logger.info("Q2 comprehensive validator retry (attempt %s): %s", attempt + 1, fix_hint)

        assert current is not None and validator is not None
        return current, validator, retried

    @staticmethod
    def _structural_issues(result: Q2ComprehensiveGenerationResult) -> list[str]:
        issues: list[str] = []
        passage = result.passage_for_exam or " ".join(p.text for p in result.numbered_paragraphs)
        if not passage.strip():
            issues.append("英文本文が空")
        words = english_word_count(passage)
        if words < Q2_WORD_MIN - 150 or words > Q2_WORD_MAX + 150:
            issues.append(f"英文の語数が目安外（約{words}語。1,000〜1,200語程度）")
        if not result.comprehension_prompt_ja.strip() or not result.model_answer_comprehension_ja.strip():
            issues.append("問1（内容把握・和訳）が未設定")
        if not result.idiom_questions:
            issues.append("問2（語彙・イディオム）が未設定")
        if not result.truth_choices or not result.truth_correct_label.strip():
            issues.append("問3（内容真偽・英語選択肢）が未設定")
        if not result.interpretation_prompt_ja.strip() or not result.model_answer_interpretation_ja.strip():
            issues.append("問4（英文解釈・内容説明）が未設定")
        if not result.cloze_blanks:
            issues.append("問5（空所補充）が未設定")
        if not result.essay_prompt_ja.strip():
            issues.append("問6（自由英作文）の設問が未設定")
        if len(result.essay_answer_examples) < 2:
            issues.append("問6の解答例が2パターン未満")
        for ex in result.essay_answer_examples:
            if english_word_count(ex.answer_en) < Q2_ESSAY_WORD_MIN:
                issues.append(
                    f"問6の解答例「{ex.stance_label or '無題'}」が80語未満"
                )
        if result.comprehension_char_limit_ja and ja_char_count(result.model_answer_comprehension_ja) > (
            result.comprehension_char_limit_ja + 10
        ):
            issues.append("問1の模範解答が字数超過")
        if not result.passage_summary_ja.strip():
            issues.append("長文全体の要約（passageSummaryJa）が空")
        combined = " ".join(
            [
                result.comprehension_prompt_ja,
                result.truth_prompt_ja,
                result.cloze_prompt_ja,
                result.essay_prompt_ja,
            ]
        ).lower()
        if "dialogue" in combined or "対話文" in combined:
            issues.append("対話文補充問題が含まれている可能性")
        return issues

    @staticmethod
    def _default_anticipated_mistakes() -> list[str]:
        return [
            "問3で本文と照合せず、選択肢の表面的な語句だけで判断する",
            "問4を直訳調の日本語にしてしまい、筆者の意図が伝わらない",
            "問6で80語に満たない、または科学的根拠のない一般論だけを書く",
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
            university_slug=slug or "sapporo-med",
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
