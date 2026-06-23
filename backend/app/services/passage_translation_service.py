"""英語長文の本文全訳を AI で生成する。"""

from __future__ import annotations

import logging
import re

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.passage_translation import (
    PASSAGE_TRANSLATION_SYSTEM,
    build_passage_translation_user_prompt,
)
from app.ai.schemas.passage_translation import PassageTranslationResponse
from app.services.passage_text_utils import (
    extract_english_passage_from_prompt,
    format_translation_with_markers,
    question_has_english_passage,
    split_source_paragraphs,
)
from app.services.passage_translation_policy import is_passage_translation_target
from app.services.question_design_service import QuestionDesignService

logger = logging.getLogger(__name__)

_TRANSLATION_MARKER_RE = re.compile(r"(【全訳】|【全文和訳】)")


def strip_translation_from_model_answer(model_answer: str) -> str:
    hit = _TRANSLATION_MARKER_RE.search(model_answer or "")
    if hit:
        return model_answer[: hit.start()].rstrip()
    return (model_answer or "").rstrip()


def append_translation_to_model_answer(model_answer: str, translation: str) -> str:
    body = strip_translation_from_model_answer(model_answer)
    trimmed = (translation or "").strip()
    if not trimmed:
        return body
    parts = [body] if body else []
    parts.extend(["【全訳】", trimmed])
    return "\n".join(parts)

def _question_existing_translation(question: dict) -> str:
    parts: list[str] = []
    if question.get("answerParts"):
        for part in question.get("answerParts") or []:
            if isinstance(part, dict) and part.get("modelAnswer"):
                parts.append(str(part["modelAnswer"]))
    elif question.get("modelAnswer"):
        parts.append(str(question["modelAnswer"]))

    for raw in parts:
        hit = re.search(r"(【全訳】|【全文和訳】)\s*\n?([\s\S]*)", raw)
        if hit:
            body = hit.group(2).strip()
            if body:
                return body
    return ""


class PassageTranslationService:
    def __init__(self):
        self.design = QuestionDesignService()
        self.gemini = GeminiAnalysisClient()

    def generate_translation_for_question(self, question: dict) -> str:
        if not is_passage_translation_target(question):
            raise ValueError(
                "この設問は本文全訳の自動生成の対象外です"
                "（和文英訳・下線部和訳・空所補充/並べ替え・英作文など、または英語長文なし）"
            )

        passage_en = extract_english_passage_from_prompt(question.get("prompt") or "")
        if not passage_en:
            raise ValueError("問題文から英語本文を抽出できませんでした")

        source_paragraphs = split_source_paragraphs(passage_en)
        label = f"第{question.get('order')}問"
        if question.get("partLabel"):
            label += f" {question['partLabel']}"

        result: PassageTranslationResponse = self.gemini.complete_structured(
            system=PASSAGE_TRANSLATION_SYSTEM,
            user_text=build_passage_translation_user_prompt(
                question_label=label,
                passage_en=passage_en,
                paragraph_count=len(source_paragraphs),
            ),
            response_schema=PassageTranslationResponse,
            max_output_tokens=8192,
        )

        paragraphs = [p.strip() for p in result.paragraphs if p and p.strip()]
        if not paragraphs:
            raise RuntimeError("AI が和訳を返しませんでした")

        if len(source_paragraphs) >= 2 and len(paragraphs) == 1:
            paragraphs = [p.strip() for p in re.split(r"\n\s*\n", paragraphs[0]) if p.strip()]

        return format_translation_with_markers(paragraphs)

    def generate_for_test(
        self,
        *,
        teacher_id: str,
        test_id: str,
        question_ids: list[str] | None = None,
        force: bool = False,
    ) -> dict:
        _test, questions = self.design._get_teacher_test(test_id, teacher_id)
        if question_ids:
            allowed = set(question_ids)
            questions = [q for q in questions if q.get("id") in allowed]

        translations: dict[str, str] = {}
        skipped: list[str] = []
        errors: dict[str, str] = {}

        for question in questions:
            qid = question.get("id") or ""
            if not qid:
                continue
            if not is_passage_translation_target(question):
                skipped.append(qid)
                continue

            existing = _question_existing_translation(question)
            if existing and not force:
                translations[qid] = existing
                continue

            try:
                translations[qid] = self.generate_translation_for_question(question)
            except Exception as exc:
                logger.exception("Passage translation failed for question %s", qid)
                errors[qid] = str(exc)

        return {
            "translations": translations,
            "skippedQuestionIds": skipped,
            "errors": errors,
        }

    def generate_for_draft(
        self,
        *,
        teacher_id: str,
        draft_id: str,
        force: bool = False,
    ) -> dict:
        draft = self.design.get_draft(teacher_id, draft_id)
        if not draft:
            raise ValueError("下書きが見つかりません")

        question_like = {
            "type": draft.get("type") or "english",
            "prompt": draft.get("prompt", ""),
            "order": draft.get("majorOrder"),
            "majorOrder": draft.get("majorOrder"),
            "partLabel": draft.get("partLabel"),
            "generationPipeline": draft.get("generationPipeline"),
            "modelAnswer": draft.get("modelAnswer", ""),
        }

        if not is_passage_translation_target(question_like):
            raise ValueError(
                "この問題は本文全訳の自動生成の対象外です"
                "（和文英訳・下線部和訳・空所補充/並べ替え・英作文など、または英語長文なし）"
            )

        existing = _question_existing_translation(question_like)
        if existing and not force:
            return {"translation": existing, "draft": draft, "generated": False}

        translation = self.generate_translation_for_question(question_like)
        model_answer = append_translation_to_model_answer(
            str(draft.get("modelAnswer") or ""),
            translation,
        )
        self.design._drafts_collection(teacher_id).document(draft_id).update(
            {"modelAnswer": model_answer}
        )
        draft["modelAnswer"] = model_answer
        return {"translation": translation, "draft": draft, "generated": True}
