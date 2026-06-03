"""第1問型（読解総合）の AI 生成パイプライン。"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.question_generation_q1 import (
    build_q1_generation_user_prompt,
    build_q1_validator_user_prompt,
)
from app.ai.prompts.universities.registry import (
    build_q1_generation_system,
    build_q1_validator_system,
)
from app.ai.schemas.q1_comprehensive_generation import (
    Q1ComprehensiveGenerationResult,
    Q1ComprehensiveValidatorResult,
)
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.question_design_service import QuestionDesignService
from app.services.question_prompt_markup import normalize_prompt_markup
from app.services.question_type_labels import format_type_label
from app.services.university_context_service import UniversityContextService

logger = logging.getLogger(__name__)

Q1_DEFAULT_POINTS = 40
Q1_WORD_MIN = 900
Q1_WORD_MAX = 1200


def english_word_count(text: str) -> int:
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text)
    return len(words)


def ja_char_count(text: str) -> int:
    return len(text.replace("\n", "").strip())


def format_q1_for_validator(result: Q1ComprehensiveGenerationResult) -> str:
    passage = result.passage_for_exam or "\n\n".join(
        f"({p.paragraph_index}) {p.text.strip()}" for p in result.numbered_paragraphs
    )
    words = english_word_count(passage)
    lines = [
        f"theme: {result.theme}",
        f"wordCount(claimed): {result.word_count} / actual~{words}",
        f"instructionsJa: {result.instructions_ja}",
        f"synonymQuestions: {len(result.synonym_questions)} items",
        f"clozeBlanks: {len(result.cloze_blanks)} items",
        "",
        "passageForExam:",
        passage,
        "",
        "synonymQuestions detail:",
    ]
    for i, sq in enumerate(result.synonym_questions, 1):
        lines.append(f"  {i}. {sq.underlined_text} → {sq.correct_label}")
    lines.extend(
        [
            "",
            f"explanationPromptJa: {result.explanation_prompt_ja}",
            f"modelAnswerExplanationJa: {result.model_answer_explanation_ja}",
            f"translationPromptJa: {result.translation_prompt_ja}",
            f"modelTranslationJa: {result.model_translation_ja}",
            f"essayPromptJa: {result.essay_prompt_ja}",
            f"modelAnswerEssayEn: {result.model_answer_essay_en}",
            f"passageSummaryJa: {result.passage_summary_ja}",
        ]
    )
    return "\n".join(lines)


def _format_synonym_block(result: Q1ComprehensiveGenerationResult) -> list[str]:
    lines = ["問1", "下線部の言い換え（同義語・同意表現）を選べ。"]
    for i, sq in enumerate(result.synonym_questions, 1):
        lines.append(f"({i}) {sq.prompt_ja.strip() or '下線部の意味として最も適当なものを1つ選べ。'}")
        if sq.underlined_text.strip():
            lines.append(f"下線部: *{sq.underlined_text.strip()}*")
        for ch in sq.choices:
            lines.append(f"  {ch.label}. {ch.text.strip()}")
        lines.append("")
    return lines


def _format_cloze_block(result: Q1ComprehensiveGenerationResult) -> list[str]:
    lines = ["問2", result.cloze_prompt_ja.strip() or "次の空所に入る最も適当なものを選べ。"]
    for blank in result.cloze_blanks:
        lines.append(f"空所 {blank.blank_label}")
        for ch in blank.choices:
            lines.append(f"  {ch.label}. {ch.text.strip()}")
    lines.append("")
    return lines


def assemble_q1_prompt(*, result: Q1ComprehensiveGenerationResult) -> str:
    header = result.instructions_ja.strip() or "次の英文を読み、下の問いに答えなさい。"
    body = result.passage_for_exam.strip()
    if not body and result.numbered_paragraphs:
        body = "\n\n".join(
            f"({p.paragraph_index}) {p.text.strip()}" for p in result.numbered_paragraphs
        )

    parts = [header, "", body, ""]
    parts.extend(_format_synonym_block(result))
    parts.extend(_format_cloze_block(result))

    parts.extend(
        [
            "問3",
            result.explanation_prompt_ja.strip(),
        ]
    )
    if result.explanation_target.strip():
        parts.append(f"【対象】 {result.explanation_target.strip()}")
    if result.char_limit_ja:
        parts.append(f"（{result.char_limit_ja}字以内の日本語で答えよ）")
    parts.append("")

    parts.extend(
        [
            "問4",
            result.translation_prompt_ja.strip(),
        ]
    )
    if result.underlined_sentence_en.strip():
        parts.append(f"下線部: *{result.underlined_sentence_en.strip()}*")
    parts.append("")

    parts.extend(
        [
            "問5",
            result.essay_prompt_ja.strip(),
        ]
    )
    if result.essay_word_min and result.essay_word_max:
        parts.append(
            f"（{result.essay_word_min}語〜{result.essay_word_max}語の英語で答えよ）"
        )

    return normalize_prompt_markup("\n".join(parts).strip())


def assemble_q1_model_answer(*, result: Q1ComprehensiveGenerationResult) -> str:
    parts: list[str] = ["■ 解答例", ""]

    parts.append("【問1】")
    for i, sq in enumerate(result.synonym_questions, 1):
        parts.append(f"({i}) {sq.correct_label.upper()} — {sq.explanation_ja.strip()}")
    parts.append("")

    parts.append("【問2】")
    for blank in result.cloze_blanks:
        parts.append(f"{blank.blank_label} {blank.correct_label.upper()} — {blank.explanation_ja.strip()}")
    parts.append("")

    parts.append("【問3】")
    parts.append(result.model_answer_explanation_ja.strip())
    if result.explanation_rationale_ja.strip():
        parts.append(result.explanation_rationale_ja.strip())
    parts.append("")

    parts.append("【問4】")
    parts.append(result.model_translation_ja.strip())
    if result.translation_rationale_ja.strip():
        parts.append(result.translation_rationale_ja.strip())
    parts.append("")

    parts.append("【問5】")
    parts.append(result.model_answer_essay_en.strip())
    if result.essay_rationale_ja.strip():
        parts.append(result.essay_rationale_ja.strip())
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


class QuestionQ1Service:
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
            major_order=1,
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

        prompt = assemble_q1_prompt(result=result)
        model_answer = assemble_q1_model_answer(result=result)

        return {
            "typeLabel": format_type_label(1, None),
            "majorOrder": 1,
            "partLabel": None,
            "prompt": prompt,
            "modelAnswer": model_answer,
            "points": Q1_DEFAULT_POINTS,
            "type": "english",
            "answerFormat": "composite",
            "notes": (
                f"{uni_name} 第1問（読解総合）パイプライン。"
                f" {result.theme or 'オリジナル模試'}"
            ),
            "referenceExamples": [],
            "anticipatedMistakes": result.common_mistakes_ja or self._default_anticipated_mistakes(),
            "generationPipeline": "q1",
            "generationArtifacts": {
                "theme": result.theme,
                "wordCount": result.word_count,
                "instructionsJa": result.instructions_ja,
                "passageForExam": result.passage_for_exam,
                "numberedParagraphs": [
                    p.model_dump(by_alias=True) for p in result.numbered_paragraphs
                ],
                "synonymQuestions": [
                    sq.model_dump(by_alias=True) for sq in result.synonym_questions
                ],
                "clozeBlanks": [b.model_dump(by_alias=True) for b in result.cloze_blanks],
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
    ) -> tuple[Q1ComprehensiveGenerationResult, Q1ComprehensiveValidatorResult, bool]:
        retried = False
        validator: Q1ComprehensiveValidatorResult | None = None
        current: Q1ComprehensiveGenerationResult | None = None
        fix_hint = ""

        for attempt in range(max_attempts):
            user_text = build_q1_generation_user_prompt(
                topic_hint=topic_hint,
                difficulty=difficulty,
                university_name=university_name,
                reference_context=reference_context,
                source_passage=source_passage,
            )
            if fix_hint:
                user_text += f"\n\n【前回の検証で指摘された点を必ず修正】\n{fix_hint}"

            current = self.gemini.complete_structured(
                system=build_q1_generation_system(university_slug, university_name),
                user_text=user_text,
                response_schema=Q1ComprehensiveGenerationResult,
                max_output_tokens=24576,
            )

            block = format_q1_for_validator(current)
            validator = self.gemini.complete_structured(
                system=build_q1_validator_system(university_slug, university_name),
                user_text=build_q1_validator_user_prompt(problem_block=block),
                response_schema=Q1ComprehensiveValidatorResult,
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
            logger.info("Q1 comprehensive validator retry (attempt %s): %s", attempt + 1, fix_hint)

        assert current is not None and validator is not None
        return current, validator, retried

    @staticmethod
    def _structural_issues(result: Q1ComprehensiveGenerationResult) -> list[str]:
        issues: list[str] = []
        passage = result.passage_for_exam or " ".join(p.text for p in result.numbered_paragraphs)
        if not passage.strip():
            issues.append("英文本文が空")
        words = english_word_count(passage)
        if words < Q1_WORD_MIN - 150 or words > Q1_WORD_MAX + 150:
            issues.append(f"英文の語数が目安外（約{words}語。900〜1,200語程度）")
        if len(result.synonym_questions) < 2:
            issues.append("問1（言い換え）が2個未満")
        if not result.cloze_blanks:
            issues.append("問2（空所補充）が未設定")
        if not result.explanation_prompt_ja.strip() or not result.model_answer_explanation_ja.strip():
            issues.append("問3（内容説明）が未設定")
        if not result.translation_prompt_ja.strip() or not result.model_translation_ja.strip():
            issues.append("問4（和訳）が未設定")
        if not result.essay_prompt_ja.strip() or not result.model_answer_essay_en.strip():
            issues.append("問5（自由英作文）が未設定")
        if result.char_limit_ja and ja_char_count(result.model_answer_explanation_ja) > result.char_limit_ja + 5:
            issues.append(
                f"問3の模範解答が字数超過（{ja_char_count(result.model_answer_explanation_ja)}字 / "
                f"{result.char_limit_ja}字以内）"
            )
        if not result.passage_summary_ja.strip():
            issues.append("長文全体の要約（passageSummaryJa）が空")
        return issues

    @staticmethod
    def _default_anticipated_mistakes() -> list[str]:
        return [
            "問1で語の辞書的意味だけを選び、文脈上の含意を読み取れない",
            "問4を直訳し、日本語として不自然な訳になる",
            "問5で本文と無関係な一般論だけを書いてしまう",
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
