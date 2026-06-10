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
from app.services.question_design_service import QuestionDesignService

logger = logging.getLogger(__name__)

_QUESTION_SECTION_RE = re.compile(r"^問\s*[\d０-９]", re.MULTILINE)


def question_has_english_passage(question: dict) -> bool:
    if question.get("type") != "english":
        return False
    prompt = question.get("prompt") or ""
    latin = len(re.findall(r"[a-zA-Z]", prompt))
    if latin < 40:
        return False
    cjk = len(re.findall(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]", prompt))
    return latin >= 80 or latin > cjk


def extract_english_passage_from_prompt(prompt: str) -> str:
    """問題文から英語本文ブロックを抽出する。"""
    if not prompt.strip():
        return ""

    blocks = re.split(r"\n\s*\n", prompt.strip())
    english_blocks: list[str] = []
    for block in blocks:
        stripped = block.strip()
        if not stripped:
            continue
        if _QUESTION_SECTION_RE.match(stripped):
            break
        latin = len(re.findall(r"[a-zA-Z]", stripped))
        cjk = len(re.findall(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]", stripped))
        if latin >= 20 and latin > cjk:
            english_blocks.append(stripped)
        elif english_blocks and cjk > latin:
            break

    return "\n\n".join(english_blocks).strip()


def split_source_paragraphs(passage_en: str) -> list[str]:
    blocks = [b.strip() for b in re.split(r"\n\s*\n", passage_en) if b.strip()]
    return blocks


def format_translation_with_markers(paragraphs: list[str]) -> str:
    cleaned = [p.strip() for p in paragraphs if p and p.strip()]
    if not cleaned:
        return ""
    if len(cleaned) == 1:
        return re.sub(r"^¶\s*\d+\s*\n?", "", cleaned[0]).strip()
    parts: list[str] = []
    for index, paragraph in enumerate(cleaned, start=1):
        body = re.sub(r"^¶\s*\d+\s*\n?", "", paragraph.strip())
        parts.append(f"¶{index}\n{body}")
    return "\n\n".join(parts)


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
        if not question_has_english_passage(question):
            raise ValueError("この設問には英語の長文本文がありません")

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
            if not question_has_english_passage(question):
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
