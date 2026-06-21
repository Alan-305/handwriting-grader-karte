"""第5問型（二次入試・長文読解）の多段 AI 生成パイプライン。"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from app.ai.generation_structured_client import GenerationStructuredClient
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
from app.generation_limits import GEMINI_MAX_OUTPUT_STANDARD
from app.services.university_context_service import UniversityContextService
from app.ai.schemas.q5_generation import (
    Q5_MAX_SUB_QUESTIONS,
    Q5_MIN_SUB_QUESTIONS,
    Q5PassageResult,
    Q5QuestionsResult,
    Q5SolverResult,
    Q5SubQuestion,
    Q5TeacherPackResult,
)
from app.ai.schemas.q5_generation_claude import Q5TeacherPackClaudeResult
from app.services.q5_scoring import (
    Q5_JA_EXPLANATION_TYPES,
    choice_design_issues,
    format_q5_part_rubric,
    format_q5_scoring_points_lines,
    scoring_points_from_dicts,
    teacher_pack_from_claude,
)
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.question_design_service import QuestionDesignService, format_type_label
from app.services.q5_prompt_markup import (
    apply_q5_passage_markup,
    normalize_q5_questions,
    q5_display_label,
    sanitize_q5_questions,
    strip_prompt_leading_label,
    q5_question_fingerprint,
)
from app.services.question_prompt_markup import normalize_prompt_markup

logger = logging.getLogger(__name__)

Q5_DEFAULT_POINTS = 20

_KYOTSU_TYPES = frozenset({"chronology", "story_map", "theme", "fact"})
_CHOICE_TYPES_5 = frozenset({"word_usage_match", "expression_meaning"})
_CHOICE_TYPES_6 = frozenset({"english_match"})
_JA_EXPLANATION_TYPES = Q5_JA_EXPLANATION_TYPES
_CHOICE_QUESTION_TYPES = frozenset({
    "cloze",
    "word_usage_match",
    "expression_meaning",
    "english_match",
    "content_match",
})


def _anchor_tokens(text: str) -> set[str]:
    return {w.lower() for w in re.findall(r"[a-z0-9]+", text) if len(w) >= 3}


def _question_anchor_tokens(q: Q5SubQuestion) -> set[str]:
    parts = [q.passage_anchor, q.underlined_text, q.target_word]
    tokens: set[str] = set()
    for part in parts:
        if part.strip():
            tokens |= _anchor_tokens(part)
    return tokens


def _normalize_questions_result(questions: Q5QuestionsResult, source_passage: str) -> None:
    """AI が本文全文を passageForExam に重複出力した場合は破棄する（JSON 切れ防止）。"""
    pfe = questions.passage_for_exam.strip()
    src = source_passage.strip()
    if pfe and src and len(pfe) >= len(src) * 0.85:
        questions.passage_for_exam = ""


def _exam_passage(questions: Q5QuestionsResult, fallback: str) -> str:
    if questions.passage_for_exam.strip():
        return normalize_prompt_markup(questions.passage_for_exam.strip())
    return apply_q5_passage_markup(fallback.strip(), questions.questions)


def _format_sub_question(q: Q5SubQuestion) -> list[str]:
    lines: list[str] = []
    lines.append(q5_display_label(q))
    body = strip_prompt_leading_label(q.prompt)
    if body:
        lines.append(body)
    if q.underlined_text.strip():
        lines.append(f"【下線部】*{q.underlined_text.strip()}*")
    if q.target_word.strip():
        lines.append(f"【対象語】 {q.target_word.strip()}")
    if q.char_limit_ja:
        lines.append(f"（{q.char_limit_ja}字以内の日本語で答えよ）")
    if q.select_count:
        lines.append(f"（{q.select_count}個選べ）")
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


def _q5_answer_label(number: int) -> str:
    if 1 <= number <= 26:
        return f"({chr(64 + number)})"
    return f"({number})"


def assemble_q5_model_answer(pack: Q5TeacherPackResult) -> str:
    parts: list[str] = [pack.model_answer_summary.strip(), ""]
    for ex in sorted(pack.explanations, key=lambda x: x.number):
        label = _q5_answer_label(ex.number)
        ans = ex.correct_choice.strip().upper()
        if ex.answer_text.strip():
            parts.append(f"{label} {ex.answer_text.strip()}")
        elif ans:
            parts.append(f"{label} {ans}")
        scoring_lines = format_q5_scoring_points_lines(
            ex.scoring_points,
            direction_criterion=ex.direction_criterion_ja,
        )
        if scoring_lines:
            parts.extend(scoring_lines)
            parts.append("")
        parts.append(ex.explanation_ja.strip())
        parts.append("")
    if pack.vocabulary_list:
        parts.append("【重要語句】")
        parts.extend(f"- {v}" for v in pack.vocabulary_list)
        parts.append("")
    if pack.full_translation_ja.strip():
        parts.append("【全訳】")
        parts.append(pack.full_translation_ja.strip())
    return "\n".join(parts).strip()


def format_solver_answers_for_teacher(solver: Q5SolverResult) -> str:
    lines = []
    for a in sorted(solver.answers, key=lambda x: x.number):
        label = _q5_answer_label(a.number)
        if a.answer_text.strip():
            lines.append(f"{label}: {a.answer_text.strip()} — {a.brief_reason}")
        else:
            lines.append(f"{label}: {a.choice.upper()} — {a.brief_reason}")
    return "\n".join(lines)


def _anchors_overlap(a: Q5SubQuestion, b: Q5SubQuestion) -> bool:
    text_a = a.passage_anchor.strip().lower()
    text_b = b.passage_anchor.strip().lower()
    if text_a and text_b and (text_a in text_b or text_b in text_a):
        return True
    tok_a = _question_anchor_tokens(a)
    tok_b = _question_anchor_tokens(b)
    if not tok_a or not tok_b:
        return False
    overlap = tok_a & tok_b
    smaller = min(len(tok_a), len(tok_b))
    return len(overlap) >= 4 and len(overlap) / smaller >= 0.6


def merge_q5_sub_questions_with_pack(
    questions: Q5QuestionsResult,
    pack: Q5TeacherPackResult,
) -> list[dict]:
    """設問 JSON に教師用 Pack の模範・採点ポイントをマージ（昇格時の小問データ用）。"""
    exp_by_num = {ex.number: ex for ex in pack.explanations}
    merged: list[dict] = []
    for q in sorted(questions.questions, key=lambda x: x.number):
        row = q.model_dump(by_alias=True)
        ex = exp_by_num.get(q.number)
        if not ex:
            merged.append(row)
            continue
        points = ex.scoring_points or q.scoring_points
        if points:
            row["scoringPoints"] = [p.model_dump(by_alias=True) for p in points]
        direction = ex.direction_criterion_ja.strip() or q.direction_criterion_ja.strip()
        if direction:
            row["directionCriterionJa"] = direction
        if ex.answer_text.strip():
            row["modelAnswerPart"] = ex.answer_text.strip()
        elif ex.correct_choice.strip():
            row["modelAnswerPart"] = ex.correct_choice.strip().upper()
        if ex.explanation_ja.strip():
            row["explanationJa"] = ex.explanation_ja.strip()
        merged.append(row)
    return merged


def _effective_scoring_points(sq: dict) -> list[Q5ScoringPoint]:
    return scoring_points_from_dicts(sq.get("scoringPoints"))


class QuestionQ5Service:
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

        passage: Q5PassageResult = self.llm.complete_structured(
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

        if not solver.passed or solver.issues:
            detail = "; ".join(solver.issues[:8]) or solver.summary or "設問の曖昧さ"
            raise RuntimeError(
                "設問の自動検証に合格しませんでした。"
                "あいまいな設問が含まれる可能性があります。"
                f"（{detail}）"
            )

        exam_body = _exam_passage(questions, passage.passage)
        solver_line = format_solver_answers_for_teacher(solver)
        questions_block = format_q5_questions_block(questions)

        pack_raw: Q5TeacherPackClaudeResult = self.llm.complete_structured(
            system=build_q5_teacher_pack_system(university_slug, Q5_TEACHER_PACK_SYSTEM),
            user_text=build_q5_teacher_pack_user_prompt(
                passage=exam_body,
                questions_block=questions_block,
                solver_answers=solver_line,
            ),
            response_schema=Q5TeacherPackClaudeResult,
            max_output_tokens=GEMINI_MAX_OUTPUT_STANDARD,
        )
        pack = teacher_pack_from_claude(pack_raw, questions)

        prompt = assemble_q5_prompt(
            instructions=questions.instructions,
            passage=passage.passage,
            questions=questions,
        )
        model_answer = assemble_q5_model_answer(pack)
        sub_questions_merged = merge_q5_sub_questions_with_pack(questions, pack)
        pack_issues = self._teacher_pack_clarity_issues(questions, pack)
        if pack_issues:
            raise RuntimeError(
                "教師用資料の採点ポイントが不足しています。"
                f"（{'; '.join(pack_issues[:6])}）"
            )

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
                f"{uni_name} 第5問（東大型: 小問6〜8・多技能組合せ）。"
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
                "subQuestions": sub_questions_merged,
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
        max_attempts: int = 4,
    ) -> tuple[Q5QuestionsResult, Q5SolverResult, bool]:
        fix_issues = ""
        retried = False
        questions: Q5QuestionsResult | None = None
        solver: Q5SolverResult | None = None

        for attempt in range(max_attempts):
            questions = self.llm.complete_structured(
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
            _normalize_questions_result(questions, passage)
            removed_dupes = 0
            questions, removed_dupes = sanitize_q5_questions(questions)
            if removed_dupes:
                fix_issues = (
                    f"同一の下線部・設問が {removed_dupes} 件重複していた。"
                    "各小問は技能・参照箇所・問いの内容がすべて異なる6〜8問に作り直すこと。"
                )
                retried = attempt < max_attempts - 1
                if retried:
                    logger.info("Q5 duplicate retry (attempt %s): removed %s", attempt + 1, removed_dupes)
                    continue
            kyotsu_hits = [
                q.question_type.lower()
                for q in questions.questions
                if q.question_type.lower() in _KYOTSU_TYPES
            ]
            if kyotsu_hits:
                fix_issues = (
                    f"共通テスト型の設問タイプ {kyotsu_hits} が含まれています。"
                    "東大第5問形式（cloze, content_explanation, reason_explanation, "
                    "word_usage_match, expression_meaning, english_match, "
                    "underlined_explanation, content_match, short_answer_ja, ordering）"
                    "に作り直してください。"
                )
                retried = attempt < max_attempts - 1
                if retried:
                    continue

            structural = (
                self._structural_issues(questions)
                + self._clarity_issues(questions)
                + choice_design_issues(questions, passage)
            )
            if structural:
                fix_issues = "; ".join(structural)
                retried = attempt < max_attempts - 1
                if retried:
                    logger.info(
                        "Q5 structural retry (attempt %s): %s", attempt + 1, fix_issues
                    )
                    continue

            exam_body = _exam_passage(questions, passage)
            questions_block = format_q5_questions_block(questions)
            solver = self.llm.complete_structured(
                system=build_q5_solver_system(university_slug, ""),
                user_text=build_q5_solver_user_prompt(
                    passage=exam_body,
                    questions_block=questions_block,
                ),
                response_schema=Q5SolverResult,
                max_output_tokens=4096,
            )
            all_issues = list(solver.issues) + structural
            if solver.issues:
                solver.passed = False
            if solver.passed and not all_issues:
                solver.issues = []
                return questions, solver, retried
            fix_issues = (
                "【検証不合格 — 以下をすべて修正して作り直す】\n"
                + ("; ".join(all_issues) if all_issues else solver.summary)
            )
            retried = attempt < max_attempts - 1
            logger.info("Q5 solver requested retry (attempt %s): %s", attempt + 1, fix_issues)

        assert questions is not None and solver is not None
        return questions, solver, retried

    @staticmethod
    def _structural_issues(questions: Q5QuestionsResult) -> list[str]:
        issues: list[str] = []
        count = len(questions.questions)
        if count < Q5_MIN_SUB_QUESTIONS or count > Q5_MAX_SUB_QUESTIONS:
            issues.append(
                f"小問数が {Q5_MIN_SUB_QUESTIONS}〜{Q5_MAX_SUB_QUESTIONS} ではない（{count}個）"
            )

        for q in questions.questions:
            if not q.passage_anchor.strip():
                issues.append(f"問{q.number}: passageAnchor が空")
            qtype = q.question_type.lower()
            if qtype in _CHOICE_TYPES_5 and len(q.choices) != 5:
                issues.append(f"問{q.number}: {qtype} は選択肢5つ(a〜e)が必要")
            if qtype in _CHOICE_TYPES_6 and len(q.choices) != 6:
                issues.append(f"問{q.number}: {qtype} は選択肢6つ(a〜f)が必要")
            if qtype == "word_usage_match" and not q.target_word.strip():
                issues.append(f"問{q.number}: word_usage_match に targetWord が必要")

        numbered = list(questions.questions)
        for i, qa in enumerate(numbered):
            for qb in numbered[i + 1 :]:
                if _anchors_overlap(qa, qb):
                    issues.append(f"問{qa.number}と問{qb.number}の本文参照箇所が重複")
                if q5_question_fingerprint(qa) == q5_question_fingerprint(qb):
                    issues.append(f"問{qa.number}と問{qb.number}の設問内容が同一")
        return issues

    @staticmethod
    def _clarity_issues(questions: Q5QuestionsResult) -> list[str]:
        """プログラム的に検出できる曖昧さ・不備。"""
        issues: list[str] = []
        vague_prompts = ("内容を説明", "意味を説明", "理由を説明")

        for q in questions.questions:
            n = q.number
            qtype = q.question_type.lower()
            prompt = strip_prompt_leading_label(q.prompt)

            if qtype in _JA_EXPLANATION_TYPES:
                if not q.char_limit_ja:
                    issues.append(f"問{n}: 日本語記述に charLimitJa がない（採点基準が曖昧）")
                if len(q.scoring_points) < 2:
                    issues.append(f"問{n}: scoringPoints が2個未満（必須採点ポイント不足）")
                if not q.direction_criterion_ja.strip():
                    issues.append(f"問{n}: directionCriterionJa が空（方向性の判定基準不足）")
                if len(prompt) < 12:
                    issues.append(f"問{n}: prompt が短すぎて問いの範囲が特定できない")

            if qtype in {"expression_meaning", "underlined_explanation"} and not q.underlined_text.strip():
                issues.append(f"問{n}: underlinedText が空（下線範囲が曖昧）")

            if qtype == "word_usage_match" and not q.target_word.strip():
                issues.append(f"問{n}: targetWord が空")

            if qtype in _CHOICE_QUESTION_TYPES:
                texts = [c.text.strip() for c in q.choices if c.text.strip()]
                lowered = [t.lower() for t in texts]
                if qtype != "cloze" and len(texts) < 4:
                    issues.append(f"問{n}: 選択肢が不足（曖昧な少択）")
                if len(lowered) != len(set(lowered)):
                    issues.append(f"問{n}: 選択肢に同一文がある")

            if qtype in _JA_EXPLANATION_TYPES and any(
                prompt.strip() == v or prompt.strip().endswith(v + "せよ。")
                for v in vague_prompts
            ):
                issues.append(f"問{n}: prompt が抽象的すぎる（本文のどの箇所か特定できない）")

        return issues

    @staticmethod
    def _teacher_pack_clarity_issues(
        questions: Q5QuestionsResult,
        pack: Q5TeacherPackResult,
    ) -> list[str]:
        issues: list[str] = []
        exp_by_num = {ex.number: ex for ex in pack.explanations}
        for q in questions.questions:
            if q.question_type.lower() not in _JA_EXPLANATION_TYPES:
                continue
            ex = exp_by_num.get(q.number)
            if not ex:
                issues.append(f"問{q.number}: 教師用Packに解説がない")
                continue
            points = ex.scoring_points or q.scoring_points
            if len(points) < 2:
                issues.append(f"問{q.number}: 採点ポイント scoringPoints が2個未満")
            direction = ex.direction_criterion_ja.strip() or q.direction_criterion_ja.strip()
            if not direction:
                issues.append(f"問{q.number}: directionCriterionJa がない")
            if not ex.answer_text.strip() and not ex.correct_choice.strip():
                issues.append(f"問{q.number}: 模範解答（answerText）がない")
        return issues

    @staticmethod
    def _default_anticipated_mistakes() -> list[str]:
        return [
            "空所補充で文脈・コロケーションを無視して語形だけで選ぶ",
            "下線部・表現の比喩・含みを読み取らず字面だけで答える",
            "語法一致・英文一致で本文のキーワードだけ一致する肢を選ぶ（内容を読まずに解答）",
            "誤読 trap の肢（字面一致・因果の取り違え）に引っかかる",
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
