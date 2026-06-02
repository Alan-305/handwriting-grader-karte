"""第5問型（二次入試・長文読解）の多段 AI 生成パイプライン。"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.question_generation_q5 import (
    Q5_TEACHER_PACK_SYSTEM,
    build_q5_passage_user_prompt,
    build_q5_questions_user_prompt,
    build_q5_solver_user_prompt,
    build_q5_teacher_pack_user_prompt,
)
from app.ai.prompts.universities.registry import (
    build_q5_passage_system,
    build_q5_questions_system,
    build_q5_solver_system,
    build_q5_teacher_pack_system,
)
from app.services.university_context_service import UniversityContextService
from app.ai.schemas.q5_generation import (
    Q5PassageResult,
    Q5QuestionsResult,
    Q5SolverResult,
    Q5SubQuestion,
    Q5TeacherPackResult,
)
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.question_design_service import QuestionDesignService, format_type_label
from app.services.question_prompt_markup import normalize_prompt_markup

logger = logging.getLogger(__name__)

Q5_DEFAULT_POINTS = 20

_KYOTSU_TYPES = frozenset({"chronology", "story_map", "theme", "fact"})


def _exam_passage(questions: Q5QuestionsResult, fallback: str) -> str:
    if questions.passage_for_exam.strip():
        return questions.passage_for_exam.strip()
    return fallback.strip()


def _format_sub_question(q: Q5SubQuestion) -> list[str]:
    lines: list[str] = []
    label = f"問{q.number}"
    if q.part_label.strip():
        label += f"（{q.part_label.strip()}）"
    lines.append(label)
    lines.append(q.prompt.strip())
    if q.underlined_text.strip():
        lines.append(f"【下線部】 {q.underlined_text.strip()}")
    if q.char_limit_ja:
        lines.append(f"（{q.char_limit_ja}字以内の日本語で答えよ）")
    if q.select_count:
        lines.append(f"（{q.select_count}個選べ）")
    if q.blank_labels:
        lines.append("空所: " + ", ".join(q.blank_labels))
    for ch in q.choices:
        lines.append(f"  {ch.label}. {ch.text.strip()}")
    return lines


def format_q5_questions_block(result: Q5QuestionsResult) -> str:
    lines: list[str] = []
    if result.instructions.strip():
        lines.append(result.instructions.strip())
        lines.append("")
    for q in sorted(result.questions, key=lambda x: x.number):
        lines.extend(_format_sub_question(q))
        lines.append("")
    return "\n".join(lines).strip()


def assemble_q5_prompt(
    *,
    instructions: str,
    passage: str,
    questions: Q5QuestionsResult,
) -> str:
    header = instructions.strip() or "次の英文を読み、下の問いに答えなさい。"
    body = _exam_passage(questions, passage)
    qs = format_q5_questions_block(questions)
    return normalize_prompt_markup(f"{header}\n\n{body}\n\n{qs}")


def assemble_q5_model_answer(pack: Q5TeacherPackResult) -> str:
    parts: list[str] = [pack.model_answer_summary.strip(), ""]
    for ex in sorted(pack.explanations, key=lambda x: x.number):
        ans = ex.correct_choice.strip().upper()
        if ex.answer_text.strip():
            parts.append(f"問{ex.number} {ex.answer_text.strip()}")
        elif ans:
            parts.append(f"問{ex.number} {ans}")
        parts.append(ex.explanation_ja.strip())
        parts.append("")
    if pack.vocabulary_list:
        parts.append("【重要語句】")
        parts.extend(f"- {v}" for v in pack.vocabulary_list)
        parts.append("")
    parts.append("【全訳】")
    parts.append(pack.full_translation_ja.strip())
    return "\n".join(parts).strip()


def format_solver_answers_for_teacher(solver: Q5SolverResult) -> str:
    lines = []
    for a in sorted(solver.answers, key=lambda x: x.number):
        if a.answer_text.strip():
            lines.append(f"問{a.number}: {a.answer_text.strip()} — {a.brief_reason}")
        else:
            lines.append(f"問{a.number}: {a.choice.upper()} — {a.brief_reason}")
    return "\n".join(lines)


class QuestionQ5Service:
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
        """本文 → 設問 → Solver → 教師用 Pack を実行し、正規化 dict を返す。"""
        uni_name = self.university_ctx.university_name(university_slug)
        ref_context = self.university_ctx.build_reference_context_for_major(
            teacher_id,
            university_slug,
            major_order=5,
            reference_years=reference_years,
            limit=2,
            max_chars=6000,
        )
        topic = topic_hint.strip()

        passage: Q5PassageResult = self.gemini.complete_structured(
            system=build_q5_passage_system(university_slug, uni_name),
            user_text=build_q5_passage_user_prompt(
                topic_hint=topic,
                difficulty=difficulty,
                university_name=uni_name,
                reference_context=ref_context,
            ),
            response_schema=Q5PassageResult,
            max_output_tokens=8192,
        )

        questions, solver, retried = self._questions_with_evaluation(
            passage=passage.passage,
            university_slug=university_slug,
            university_name=uni_name,
            reference_context=ref_context,
        )

        exam_body = _exam_passage(questions, passage.passage)
        solver_line = format_solver_answers_for_teacher(solver)
        questions_block = format_q5_questions_block(questions)

        pack: Q5TeacherPackResult = self.gemini.complete_structured(
            system=build_q5_teacher_pack_system(university_slug, Q5_TEACHER_PACK_SYSTEM),
            user_text=build_q5_teacher_pack_user_prompt(
                passage=exam_body,
                questions_block=questions_block,
                solver_answers=solver_line,
            ),
            response_schema=Q5TeacherPackResult,
            max_output_tokens=16384,
        )

        prompt = assemble_q5_prompt(
            instructions=questions.instructions,
            passage=passage.passage,
            questions=questions,
        )
        model_answer = assemble_q5_model_answer(pack)

        return {
            "typeLabel": format_type_label(5, None),
            "majorOrder": 5,
            "partLabel": None,
            "prompt": prompt,
            "modelAnswer": model_answer,
            "points": Q5_DEFAULT_POINTS,
            "type": "english",
            "answerFormat": "composite",
            "notes": (
                f"{uni_name} 第5問（東大型: 空所・下線・記述・並べ替え）。"
                f" テーマ: {passage.theme_summary or '—'}"
            ),
            "referenceExamples": [],
            "anticipatedMistakes": self._default_anticipated_mistakes(),
            "generationPipeline": "q5",
            "generationArtifacts": {
                "passage": passage.passage,
                "passageForExam": exam_body,
                "passageTitle": passage.title,
                "wordCount": passage.word_count,
                "themeSummary": passage.theme_summary,
                "instructions": questions.instructions,
                "subQuestions": [q.model_dump(by_alias=True) for q in questions.questions],
                "fullTranslationJa": pack.full_translation_ja,
                "vocabularyList": pack.vocabulary_list,
                "evaluatorPassed": solver.passed,
                "evaluatorIssues": solver.issues,
                "evaluatorSummary": solver.summary,
                "retriedQuestions": retried,
            },
        }

    def _questions_with_evaluation(
        self,
        *,
        passage: str,
        university_slug: str = "",
        university_name: str = "",
        reference_context: str = "",
        max_attempts: int = 2,
    ) -> tuple[Q5QuestionsResult, Q5SolverResult, bool]:
        fix_issues = ""
        retried = False
        questions: Q5QuestionsResult | None = None
        solver: Q5SolverResult | None = None

        for attempt in range(max_attempts):
            questions = self.gemini.complete_structured(
                system=build_q5_questions_system(university_slug, university_name),
                user_text=build_q5_questions_user_prompt(
                    passage=passage,
                    fix_issues=fix_issues,
                    reference_context=reference_context,
                    university_name=university_name,
                ),
                response_schema=Q5QuestionsResult,
                max_output_tokens=16384,
            )
            kyotsu_hits = [
                q.question_type.lower()
                for q in questions.questions
                if q.question_type.lower() in _KYOTSU_TYPES
            ]
            if kyotsu_hits:
                fix_issues = (
                    f"共通テスト型の設問タイプ {kyotsu_hits} が含まれています。"
                    "東大第5問形式（cloze, underlined_explanation, content_match, "
                    "short_answer_ja, ordering）に作り直してください。"
                )
                retried = attempt < max_attempts - 1
                if retried:
                    continue

            exam_body = _exam_passage(questions, passage)
            questions_block = format_q5_questions_block(questions)
            solver = self.gemini.complete_structured(
                system=build_q5_solver_system(university_slug, ""),
                user_text=build_q5_solver_user_prompt(
                    passage=exam_body,
                    questions_block=questions_block,
                ),
                response_schema=Q5SolverResult,
                max_output_tokens=4096,
            )
            if solver.passed and not solver.issues:
                return questions, solver, retried
            fix_issues = "; ".join(solver.issues) or solver.summary
            retried = attempt < max_attempts - 1
            logger.info("Q5 solver requested retry (attempt %s): %s", attempt + 1, fix_issues)

        assert questions is not None and solver is not None
        return questions, solver, retried

    @staticmethod
    def _default_anticipated_mistakes() -> list[str]:
        return [
            "空所補充で文脈・コロケーションを無視して語形だけで選ぶ",
            "下線部の比喩・含みを読み取らず字面だけで答える",
            "日本語記述で字数を超えたり、本文にない憶測を書く",
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
