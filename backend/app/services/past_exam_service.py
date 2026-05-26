import json
import logging
import shutil
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.past_exam_import import PAST_EXAM_IMPORT_SYSTEM, build_past_exam_import_prompt
from app.ai.prompts.past_exam_listening_import import (
    LISTENING_SCRIPT_IMPORT_SYSTEM,
    build_listening_import_prompt,
)
from app.ai.schemas.past_exam import (
    ListeningScriptParseResponse,
    PastExamParseResponse,
    PastQuestionProfile,
)
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.pdf_text_extractor import extract_text_from_pdf, extract_text_from_pdfs

logger = logging.getLogger(__name__)

UNIVERSITY_REGISTRY: dict[str, dict] = {
    "todai": {
        "name": "東京大学",
        "nameEn": "The University of Tokyo",
        "expectsListening": True,
    },
}


@dataclass
class ImportSources:
    exam_pdfs: list[Path]
    answers_pdf: Path | None = None
    listening_pdf: Path | None = None

    @property
    def primary_exam_pdf(self) -> Path:
        return self.exam_pdfs[0]


def _nfc(text: str) -> str:
    """macOS の NFD ファイル名（リスニング等）を NFC に揃える。"""
    return unicodedata.normalize("NFC", text)


def _pdf_files(folder: Path) -> list[Path]:
    return sorted(p for p in folder.glob("*.pdf") if p.is_file())


def _is_listening_pdf(path: Path) -> bool:
    name = _nfc(path.name)
    lower = name.lower()
    return (
        lower == "listening.pdf"
        or lower.startswith("listening")
        or "リスニング" in name
        or "ｽｸﾘﾌﾟﾄ" in name
    )


def _is_exam_pdf(path: Path) -> bool:
    name = _nfc(path.name)
    lower = name.lower()
    if _is_listening_pdf(path):
        return False
    if lower in {"answers.pdf", "listening.pdf"}:
        return False
    return lower == "exam.pdf" or lower.startswith("exam") or "問題" in name


def _is_answers_pdf(path: Path) -> bool:
    name = _nfc(path.name)
    return name.lower() == "answers.pdf" or "解答" in name


def _find_listening_pdf(folder: Path) -> Path | None:
    listening = folder / "listening.pdf"
    if listening.is_file():
        return listening
    for p in _pdf_files(folder):
        if _is_listening_pdf(p):
            return p
    return None


def _find_exam_pdfs(folder: Path) -> list[Path]:
    return [p for p in _pdf_files(folder) if _is_exam_pdf(p)]


def _find_answers_pdf(folder: Path) -> Path | None:
    answers = folder / "answers.pdf"
    if answers.is_file():
        return answers
    for p in _pdf_files(folder):
        if _is_answers_pdf(p) and not _is_listening_pdf(p):
            return p
    return None


class PastExamService:
    YEAR_DIR_NAME = "past-exams"
    SESSION_DIR_NAME = ".import-sessions"

    def __init__(self):
        self.firebase = FirebaseAdminService()
        self.gemini = GeminiAnalysisClient()

    @staticmethod
    def project_root() -> Path:
        return Path(__file__).resolve().parents[3]

    def year_dir(self, university_slug: str, year: int) -> Path:
        return self.project_root() / "data" / self.YEAR_DIR_NAME / "universities" / university_slug / str(year)

    def discover_sources(self, university_slug: str, year: int) -> ImportSources:
        """年度フォルダから PDF を自動検出する。

        問題用紙: exam.pdf / exam_*.pdf / *問題*.pdf
        模範解答: answers.pdf / *解答*.pdf（任意）
        リスニング: listening.pdf / *リスニング*.pdf（任意・東大など）
        """
        folder = self.year_dir(university_slug, year)
        if not folder.is_dir():
            raise FileNotFoundError(f"Year folder not found: {folder}")

        exam_pdfs = _find_exam_pdfs(folder)
        if not exam_pdfs:
            raise FileNotFoundError(
                f"No exam PDF found in {folder}. "
                "Add exam.pdf, exam_01.pdf, or *問題*.pdf. "
                "Optional: answers.pdf, listening.pdf or *リスニング*.pdf."
            )

        answers_pdf = _find_answers_pdf(folder)
        listening_pdf = _find_listening_pdf(folder)

        return ImportSources(exam_pdfs=exam_pdfs, answers_pdf=answers_pdf, listening_pdf=listening_pdf)

    def resolve_sources(
        self,
        university_slug: str,
        year: int,
        exam_pdf_paths: list[str] | None = None,
        answers_pdf_path: str | None = None,
        listening_pdf_path: str | None = None,
        *,
        listening_only: bool = False,
    ) -> ImportSources:
        if listening_only:
            if listening_pdf_path:
                listening_pdf = Path(listening_pdf_path)
                if not listening_pdf.is_file():
                    raise FileNotFoundError(f"Listening PDF not found: {listening_pdf}")
                return ImportSources(exam_pdfs=[], answers_pdf=None, listening_pdf=listening_pdf)
            discovered = self.discover_sources(university_slug, year)
            if not discovered.listening_pdf:
                raise FileNotFoundError(
                    f"No listening PDF in {self.year_dir(university_slug, year)}. "
                    "Add listening.pdf or *リスニング*.pdf, or pass --listening-pdf."
                )
            return ImportSources(exam_pdfs=[], answers_pdf=None, listening_pdf=discovered.listening_pdf)

        if not exam_pdf_paths and not answers_pdf_path and not listening_pdf_path:
            return self.discover_sources(university_slug, year)

        if exam_pdf_paths:
            exam_pdfs = [Path(p) for p in exam_pdf_paths]
            for p in exam_pdfs:
                if not p.is_file():
                    raise FileNotFoundError(f"Exam PDF not found: {p}")
        else:
            exam_pdfs = self.discover_sources(university_slug, year).exam_pdfs

        if answers_pdf_path:
            answers_pdf = Path(answers_pdf_path)
            if not answers_pdf.is_file():
                raise FileNotFoundError(f"Answers PDF not found: {answers_pdf}")
        else:
            answers_pdf = self.discover_sources(university_slug, year).answers_pdf

        if listening_pdf_path:
            listening_pdf = Path(listening_pdf_path)
            if not listening_pdf.is_file():
                raise FileNotFoundError(f"Listening PDF not found: {listening_pdf}")
        else:
            listening_pdf = self.discover_sources(university_slug, year).listening_pdf

        return ImportSources(exam_pdfs=exam_pdfs, answers_pdf=answers_pdf, listening_pdf=listening_pdf)

    def import_session_dir(self, session_id: str) -> Path:
        return self.project_root() / "data" / self.YEAR_DIR_NAME / self.SESSION_DIR_NAME / session_id

    @staticmethod
    def build_sources_from_paths(
        exam_pdfs: list[Path],
        answers_pdf: Path | None = None,
        listening_pdf: Path | None = None,
    ) -> ImportSources:
        if not exam_pdfs:
            raise ValueError("At least one exam PDF is required")
        for path in exam_pdfs:
            if not path.is_file():
                raise FileNotFoundError(f"Exam PDF not found: {path}")
        if answers_pdf and not answers_pdf.is_file():
            raise FileNotFoundError(f"Answers PDF not found: {answers_pdf}")
        if listening_pdf and not listening_pdf.is_file():
            raise FileNotFoundError(f"Listening PDF not found: {listening_pdf}")
        return ImportSources(exam_pdfs=exam_pdfs, answers_pdf=answers_pdf, listening_pdf=listening_pdf)

    def create_import_session(
        self,
        *,
        university_slug: str,
        year: int,
        sources: ImportSources,
        parsed: PastExamParseResponse,
    ) -> str:
        session_id = uuid.uuid4().hex
        session_dir = self.import_session_dir(session_id)
        session_dir.mkdir(parents=True, exist_ok=True)

        stored_exam_paths: list[str] = []
        for index, exam_pdf in enumerate(sources.exam_pdfs):
            dest = session_dir / (f"exam{index + 1}.pdf" if index else "exam.pdf")
            shutil.copy2(exam_pdf, dest)
            stored_exam_paths.append(str(dest.resolve()))

        stored_answers: str | None = None
        if sources.answers_pdf:
            dest = session_dir / "answers.pdf"
            shutil.copy2(sources.answers_pdf, dest)
            stored_answers = str(dest.resolve())

        stored_listening: str | None = None
        if sources.listening_pdf:
            dest = session_dir / "listening.pdf"
            shutil.copy2(sources.listening_pdf, dest)
            stored_listening = str(dest.resolve())

        manifest = {
            "sessionId": session_id,
            "universitySlug": university_slug,
            "year": year,
            "sourceExamPdfs": stored_exam_paths,
            "sourceAnswersPdf": stored_answers,
            "sourceListeningPdf": stored_listening,
            "parsedAt": datetime.now(timezone.utc).isoformat(),
            "parsed": parsed.model_dump(by_alias=True),
        }
        (session_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        logger.info("Created import session %s for %s/%s", session_id, university_slug, year)
        return session_id

    def load_import_session(self, session_id: str) -> tuple[str, int, PastExamParseResponse, ImportSources]:
        session_dir = self.import_session_dir(session_id)
        manifest_path = session_dir / "manifest.json"
        if not manifest_path.is_file():
            raise FileNotFoundError(f"Import session not found: {session_id}")

        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        parsed = PastExamParseResponse.model_validate(data["parsed"])
        exam_pdfs = [Path(p) for p in data.get("sourceExamPdfs") or []]
        answers_raw = data.get("sourceAnswersPdf")
        listening_raw = data.get("sourceListeningPdf")
        sources = ImportSources(
            exam_pdfs=exam_pdfs,
            answers_pdf=Path(answers_raw) if answers_raw else None,
            listening_pdf=Path(listening_raw) if listening_raw else None,
        )
        return data["universitySlug"], int(data["year"]), parsed, sources

    def update_import_session_parsed(self, session_id: str, parsed: PastExamParseResponse) -> None:
        session_dir = self.import_session_dir(session_id)
        manifest_path = session_dir / "manifest.json"
        if not manifest_path.is_file():
            raise FileNotFoundError(f"Import session not found: {session_id}")
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        data["parsed"] = parsed.model_dump(by_alias=True)
        data["parsedAt"] = datetime.now(timezone.utc).isoformat()
        manifest_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def delete_import_session(self, session_id: str) -> None:
        session_dir = self.import_session_dir(session_id)
        if session_dir.is_dir():
            shutil.rmtree(session_dir, ignore_errors=True)

    def list_universities(self) -> list[dict]:
        rows = self.firebase.query_collection("universities", "status", "==", "active")
        if rows:
            return sorted(rows, key=lambda row: row.get("name", row.get("slug", "")))

        return [
            {
                "id": slug,
                "slug": slug,
                **meta,
                "status": "active",
            }
            for slug, meta in UNIVERSITY_REGISTRY.items()
        ]

    def list_exam_years(self, university_slug: str) -> list[dict]:
        db = self.firebase.db()
        if not db:
            raise RuntimeError(
                "Firestore is not initialized. Set GOOGLE_APPLICATION_CREDENTIALS in .env"
            )
        ref = (
            db.collection("universities")
            .document(university_slug)
            .collection("exam_years")
        )
        rows: list[dict] = []
        for doc in ref.stream():
            item = doc.to_dict() or {}
            item["id"] = doc.id
            rows.append(item)
        return sorted(rows, key=lambda row: int(row.get("year") or 0), reverse=True)

    def get_exam_year(self, university_slug: str, year: int) -> dict | None:
        db = self.firebase.db()
        if not db:
            raise RuntimeError(
                "Firestore is not initialized. Set GOOGLE_APPLICATION_CREDENTIALS in .env"
            )
        snap = (
            db.collection("universities")
            .document(university_slug)
            .collection("exam_years")
            .document(str(year))
            .get()
        )
        if not snap.exists:
            return None
        item = snap.to_dict() or {}
        item["id"] = snap.id
        return item

    def list_past_questions(self, university_slug: str, year: int) -> list[dict]:
        db = self.firebase.db()
        if not db:
            raise RuntimeError(
                "Firestore is not initialized. Set GOOGLE_APPLICATION_CREDENTIALS in .env"
            )
        docs = (
            db.collection("universities")
            .document(university_slug)
            .collection("past_questions")
            .where("year", "==", year)
            .stream()
        )
        rows: list[dict] = []
        for doc in docs:
            item = doc.to_dict() or {}
            item["id"] = doc.id
            rows.append(item)
        return sorted(
            rows,
            key=lambda row: (
                int(row.get("majorOrder") or 0),
                str(row.get("partLabel") or ""),
            ),
        )

    def ensure_exam_year_stub(self, university_slug: str, year: int) -> None:
        """教師分析のみ先に保存する場合など、年度レコードの器を確保する。"""
        self.ensure_university(university_slug)
        existing = self.get_exam_year(university_slug, year)
        if existing:
            return
        now = datetime.now(timezone.utc)
        self.firebase.set_nested_doc(
            ["universities", university_slug, "exam_years", str(year)],
            {
                "year": year,
                "examType": "",
                "importStatus": "draft",
                "questionCount": 0,
                "listeningScriptCount": 0,
                "listeningScripts": [],
                "parseNotes": "",
                "createdAt": now,
            },
            merge=True,
        )

    @staticmethod
    def _teacher_material_doc_id(university_slug: str, year: int) -> str:
        return f"{university_slug}_{year}"

    def get_teacher_exam_material(self, teacher_id: str, university_slug: str, year: int) -> dict | None:
        db = self.firebase.db()
        if not db:
            raise RuntimeError(
                "Firestore is not initialized. Set GOOGLE_APPLICATION_CREDENTIALS in .env"
            )
        doc_id = self._teacher_material_doc_id(university_slug, year)
        snap = (
            db.collection("teachers")
            .document(teacher_id)
            .collection("exam_materials")
            .document(doc_id)
            .get()
        )
        if not snap.exists:
            return None
        item = snap.to_dict() or {}
        item["id"] = snap.id
        return item

    def save_teacher_exam_material(
        self,
        teacher_id: str,
        university_slug: str,
        year: int,
        *,
        title: str,
        content: str,
        attachments: list[dict],
    ) -> dict:
        self.ensure_exam_year_stub(university_slug, year)
        now = datetime.now(timezone.utc)
        doc_id = self._teacher_material_doc_id(university_slug, year)
        existing = self.get_teacher_exam_material(teacher_id, university_slug, year)
        payload = {
            "teacherId": teacher_id,
            "universitySlug": university_slug,
            "year": year,
            "title": title.strip() or f"{year}年度 分析メモ",
            "content": content,
            "attachments": attachments,
            "updatedAt": now,
        }
        if not existing:
            payload["createdAt"] = now
        db = self.firebase.db()
        if not db:
            raise RuntimeError(
                "Firestore is not initialized. Set GOOGLE_APPLICATION_CREDENTIALS in .env"
            )
        ref = (
            db.collection("teachers")
            .document(teacher_id)
            .collection("exam_materials")
            .document(doc_id)
        )
        ref.set(payload, merge=True)
        payload["id"] = doc_id
        return payload

    def draft_import_path(self, university_slug: str, year: int) -> Path:
        return self.year_dir(university_slug, year) / "import-draft.json"

    def listening_draft_path(self, university_slug: str, year: int) -> Path:
        return self.year_dir(university_slug, year) / "listening-import-draft.json"

    def parse_listening_pdf(
        self,
        *,
        university_slug: str,
        year: int,
        listening_pdf: Path,
    ) -> ListeningScriptParseResponse:
        script_text = extract_text_from_pdf(listening_pdf, gemini_client=self.gemini)
        prompt = build_listening_import_prompt(
            university_slug=university_slug,
            year=year,
            script_text=script_text,
        )
        result: ListeningScriptParseResponse = self.gemini.complete_structured(
            system=LISTENING_SCRIPT_IMPORT_SYSTEM,
            user_text=prompt,
            response_schema=ListeningScriptParseResponse,
        )
        if result.year != year:
            result = result.model_copy(update={"year": year})
        return result

    def parse_sources(
        self,
        *,
        university_slug: str,
        year: int,
        sources: ImportSources,
    ) -> PastExamParseResponse:
        if not sources.exam_pdfs:
            raise ValueError("parse_sources requires at least one exam PDF")

        exam_text = extract_text_from_pdfs(
            sources.exam_pdfs, label_prefix="問題用紙", gemini_client=self.gemini
        )
        answers_text = None
        if sources.answers_pdf:
            answers_text = extract_text_from_pdf(sources.answers_pdf, gemini_client=self.gemini)

        prompt = build_past_exam_import_prompt(
            university_slug=university_slug,
            year=year,
            exam_text=exam_text,
            answers_text=answers_text,
            separate_listening_pdf=sources.listening_pdf is not None,
        )
        result: PastExamParseResponse = self.gemini.complete_structured(
            system=PAST_EXAM_IMPORT_SYSTEM,
            user_text=prompt,
            response_schema=PastExamParseResponse,
        )
        if result.year != year:
            result = result.model_copy(update={"year": year})

        normalized_questions = []
        for q in result.questions:
            enriched = self._enrich_parsed_question(q, exam_type=result.exam_type)
            if enriched.answer_format != q.answer_format or enriched.type != q.type:
                logger.info(
                    "Enriched question majorOrder=%s partLabel=%s answerFormat=%s type=%s",
                    enriched.major_order,
                    enriched.part_label,
                    enriched.answer_format,
                    enriched.type,
                )
            normalized_questions.append(enriched)
        result = result.model_copy(update={"questions": normalized_questions})

        if len(result.questions) > 15:
            logger.warning(
                "Parsed %s questions (expected ~4-12). Review import-draft.json and merge if needed.",
                len(result.questions),
            )

        if sources.listening_pdf:
            listening = self.parse_listening_pdf(
                university_slug=university_slug,
                year=year,
                listening_pdf=sources.listening_pdf,
            )
            result = result.model_copy(update={"listening_scripts": listening.listening_scripts})
            if listening.parse_notes:
                merged_notes = f"{result.parse_notes}\n{listening.parse_notes}".strip()
                result = result.model_copy(update={"parse_notes": merged_notes})

        return result

    def save_draft(
        self,
        university_slug: str,
        year: int,
        parsed: PastExamParseResponse,
        sources: ImportSources,
    ) -> Path:
        out = self.draft_import_path(university_slug, year)
        out.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "universitySlug": university_slug,
            "sourceExamPdfs": [str(p.resolve()) for p in sources.exam_pdfs],
            "sourceAnswersPdf": str(sources.answers_pdf.resolve()) if sources.answers_pdf else None,
            "sourceListeningPdf": str(sources.listening_pdf.resolve()) if sources.listening_pdf else None,
            "parsedAt": datetime.now(timezone.utc).isoformat(),
            "parsed": parsed.model_dump(by_alias=True),
        }
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("Wrote import draft to %s", out)
        return out

    def load_draft_bundle(self, university_slug: str, year: int) -> tuple[PastExamParseResponse, ImportSources]:
        path = self.draft_import_path(university_slug, year)
        if not path.is_file():
            raise FileNotFoundError(f"No import draft at {path}. Run parse step first.")
        data = json.loads(path.read_text(encoding="utf-8"))
        parsed = PastExamParseResponse.model_validate(data["parsed"])

        exam_pdfs = [Path(p) for p in data.get("sourceExamPdfs") or []]
        if not exam_pdfs and data.get("sourcePdf"):
            exam_pdfs = [Path(data["sourcePdf"])]
        answers_raw = data.get("sourceAnswersPdf")
        listening_raw = data.get("sourceListeningPdf")
        sources = ImportSources(
            exam_pdfs=exam_pdfs,
            answers_pdf=Path(answers_raw) if answers_raw else None,
            listening_pdf=Path(listening_raw) if listening_raw else None,
        )
        return parsed, sources

    def save_listening_draft(
        self,
        university_slug: str,
        year: int,
        parsed: ListeningScriptParseResponse,
        listening_pdf: Path,
    ) -> Path:
        out = self.listening_draft_path(university_slug, year)
        out.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "universitySlug": university_slug,
            "sourceListeningPdf": str(listening_pdf.resolve()),
            "parsedAt": datetime.now(timezone.utc).isoformat(),
            "parsed": parsed.model_dump(by_alias=True),
        }
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return out

    def load_listening_draft_bundle(
        self, university_slug: str, year: int
    ) -> tuple[ListeningScriptParseResponse, Path]:
        path = self.listening_draft_path(university_slug, year)
        if not path.is_file():
            raise FileNotFoundError(f"No listening draft at {path}. Run --listening-only first.")
        data = json.loads(path.read_text(encoding="utf-8"))
        parsed = ListeningScriptParseResponse.model_validate(data["parsed"])
        listening_pdf = Path(data["sourceListeningPdf"])
        return parsed, listening_pdf

    def write_listening_to_firestore(
        self,
        *,
        university_slug: str,
        year: int,
        parsed: ListeningScriptParseResponse,
        listening_pdf: Path,
        upload_pdf: bool = True,
        profile_status: str = "draft",
    ) -> dict:
        self.ensure_university(university_slug)
        now = datetime.now(timezone.utc)
        listening_storage_path: str | None = None

        if upload_pdf and self.firebase.bucket():
            listening_storage_path = (
                f"platform/universities/{university_slug}/past-exams/{year}/listening.pdf"
            )
            self.firebase.upload_bytes(
                listening_storage_path,
                listening_pdf.read_bytes(),
                content_type="application/pdf",
            )

        scripts = [s.model_dump() for s in parsed.listening_scripts]
        self.firebase.set_nested_doc(
            ["universities", university_slug, "exam_years", str(year)],
            {
                "year": year,
                "sourceListeningPdfPath": listening_storage_path,
                "listeningScriptCount": len(scripts),
                "listeningScripts": scripts,
                "listeningImportStatus": profile_status,
                "listeningParseNotes": parsed.parse_notes,
                "updatedAt": now,
            },
            merge=True,
        )

        return {
            "universitySlug": university_slug,
            "year": year,
            "listeningScriptCount": len(scripts),
            "listeningPdfStoragePath": listening_storage_path,
        }

    def load_draft(self, university_slug: str, year: int) -> PastExamParseResponse:
        parsed, _ = self.load_draft_bundle(university_slug, year)
        return parsed

    def ensure_university(self, university_slug: str) -> None:
        meta = UNIVERSITY_REGISTRY.get(university_slug, {"name": university_slug, "nameEn": ""})
        self.firebase.set_doc(
            "universities",
            university_slug,
            {
                "slug": university_slug,
                "name": meta["name"],
                "nameEn": meta.get("nameEn", ""),
                "status": "active",
            },
            merge=True,
        )

    def write_to_firestore(
        self,
        *,
        university_slug: str,
        year: int,
        parsed: PastExamParseResponse,
        sources: ImportSources,
        upload_pdf: bool = True,
        profile_status: str = "draft",
    ) -> dict:
        self.ensure_university(university_slug)
        now = datetime.now(timezone.utc)

        exam_storage_paths: list[str] = []
        answers_storage_path: str | None = None
        listening_storage_path: str | None = None

        if upload_pdf and self.firebase.bucket():
            for index, exam_pdf in enumerate(sources.exam_pdfs):
                suffix = "" if index == 0 else f"_{index + 1}"
                storage_path = f"platform/universities/{university_slug}/past-exams/{year}/exam{suffix}.pdf"
                self.firebase.upload_bytes(
                    storage_path,
                    exam_pdf.read_bytes(),
                    content_type="application/pdf",
                )
                exam_storage_paths.append(storage_path)

            if sources.answers_pdf:
                answers_storage_path = (
                    f"platform/universities/{university_slug}/past-exams/{year}/answers.pdf"
                )
                self.firebase.upload_bytes(
                    answers_storage_path,
                    sources.answers_pdf.read_bytes(),
                    content_type="application/pdf",
                )

            if sources.listening_pdf:
                listening_storage_path = (
                    f"platform/universities/{university_slug}/past-exams/{year}/listening.pdf"
                )
                self.firebase.upload_bytes(
                    listening_storage_path,
                    sources.listening_pdf.read_bytes(),
                    content_type="application/pdf",
                )

        exam_year_path = ["universities", university_slug, "exam_years", str(year)]
        listening_scripts = [s.model_dump() for s in parsed.listening_scripts]
        self.firebase.set_nested_doc(
            exam_year_path,
            {
                "year": year,
                "examType": parsed.exam_type,
                "sourcePdfPaths": exam_storage_paths,
                "sourceAnswersPdfPath": answers_storage_path,
                "sourceListeningPdfPath": listening_storage_path,
                "importStatus": profile_status,
                "questionCount": len(parsed.questions),
                "listeningScriptCount": len(listening_scripts),
                "listeningScripts": listening_scripts,
                "parseNotes": parsed.parse_notes,
                "createdAt": now,
            },
            merge=True,
        )

        question_ids: list[str] = []
        for q in parsed.questions:
            enriched = self._enrich_parsed_question(q, exam_type=parsed.exam_type)
            qtype = enriched.type
            answer_format = enriched.answer_format or self._infer_answer_format(q.prompt)
            doc_id = self._question_doc_id(q.major_order, q.part_label)
            profile = PastQuestionProfile(
                archetype=self._guess_archetype(qtype, q.prompt, answer_format=answer_format),
                required_skills=[],
                common_traps=[],
            )
            has_answer = bool(q.model_answer.strip())
            model_source = "official" if has_answer and sources.answers_pdf else (
                "official" if has_answer else "none"
            )
            self.firebase.set_nested_doc(
                ["universities", university_slug, "past_questions", f"{year}_{doc_id}"],
                {
                    "year": year,
                    "majorOrder": q.major_order,
                    "partLabel": q.part_label,
                    "type": qtype,
                    "answerFormat": answer_format,
                    "prompt": q.prompt,
                    "modelAnswer": q.model_answer,
                    "modelAnswerSource": model_source,
                    "modelAnswerStatus": "draft" if has_answer else "draft",
                    "points": q.points,
                    "profile": profile.model_dump(by_alias=True),
                    "profileStatus": profile_status,
                    "importNotes": q.notes,
                    "createdAt": now,
                },
                merge=False,
            )
            question_ids.append(f"{year}_{doc_id}")

        return {
            "universitySlug": university_slug,
            "year": year,
            "questionIds": question_ids,
            "examPdfStoragePaths": exam_storage_paths,
            "answersPdfStoragePath": answers_storage_path,
            "listeningPdfStoragePath": listening_storage_path,
            "profileStatus": profile_status,
        }

    @staticmethod
    def _question_doc_id(major_order: int, part_label: str | None) -> str:
        if part_label:
            safe = part_label.strip("()（）").replace(" ", "")
            return f"{major_order}_{safe}"
        return str(major_order)

    @staticmethod
    def _infer_answer_format(prompt: str) -> str:
        """問題文から解答方式を推定する。"""
        symbol_markers = (
            "マークシート",
            "記号をマーク",
            "一つ選び",
            "選びなさい",
            "マークせよ",
            "記号を選",
        )
        japanese_writing_markers = (
            "日本語で",
            "字の日本語",
            "百字",
            "100字",
            "和訳し",
            "和訳せよ",
            "要約せよ",
        )
        english_writing_markers = (
            "語の英語",
            "英語で答え",
            "英語で述べ",
            "英語で書",
            "英語で表現",
            "英訳せよ",
            "英訳し",
            "並べ替え",
            "正しい順",
            "words",
        )

        has_symbol = any(m in prompt for m in symbol_markers)
        has_japanese = any(m in prompt for m in japanese_writing_markers)
        has_english = any(m in prompt for m in english_writing_markers) or (
            "英語で" in prompt and "日本語" not in prompt.split("英語で")[0][-10:]
        )

        if has_symbol and has_japanese and has_english:
            return "composite"
        if has_symbol and has_japanese:
            return "composite"
        if has_symbol and has_english:
            return "composite"
        if has_symbol:
            return "symbol"
        if has_japanese and has_english:
            return "composite"
        if has_japanese:
            return "japanese_writing"
        if has_english:
            return "english_writing"
        if "要約" in prompt or "和訳" in prompt:
            return "japanese_writing"
        return "english_writing"

    @staticmethod
    def _grading_type_for(answer_format: str, exam_type: str = "") -> str:
        """添削エンジン向け type（内部用）。"""
        if answer_format == "symbol":
            return "symbol"
        if answer_format == "japanese_writing" and "国語" in exam_type:
            return "japanese"
        return "english"

    def _enrich_parsed_question(self, q, *, exam_type: str = ""):
        answer_format = q.answer_format or self._infer_answer_format(q.prompt)
        grading_type = self._grading_type_for(answer_format, exam_type)
        return q.model_copy(update={"answer_format": answer_format, "type": grading_type})

    @staticmethod
    def _normalize_question_type(qtype: str, prompt: str, *, exam_type: str = "") -> str:
        """後方互換: answerFormat から grading type を返す。"""
        answer_format = PastExamService._infer_answer_format(prompt)
        if qtype == "japanese" and answer_format == "japanese_writing" and "国語" not in exam_type:
            return PastExamService._grading_type_for(answer_format, exam_type)
        if qtype != "japanese":
            return qtype
        return PastExamService._grading_type_for(answer_format, exam_type)

    @staticmethod
    def _guess_archetype(qtype: str, prompt: str, *, answer_format: str = "") -> str:
        fmt = answer_format or PastExamService._infer_answer_format(prompt)
        text = prompt.lower()
        if fmt == "symbol":
            return "symbol_short_answer"
        if fmt == "composite":
            return "composite_mixed"
        if fmt == "japanese_writing":
            if "要約" in prompt:
                return "japanese_summary"
            if "和訳" in prompt or "訳し" in prompt:
                return "japanese_translation"
            if "100" in prompt or "百字" in prompt:
                return "japanese_100chars"
            return "japanese_essay"
        if fmt == "english_writing":
            if "語" in prompt or "words" in text:
                return "english_composition"
            if "英訳" in prompt:
                return "english_translation"
            if "並べ替え" in prompt or "正しい順" in prompt:
                return "english_reorder"
            return "english_reading"
        if qtype == "english":
            if "要約" in prompt and ("字" in prompt or "日本語" in prompt):
                return "japanese_summary"
            if "語" in prompt or "words" in text:
                return "english_composition"
            if "和訳" in prompt or "訳し" in prompt:
                return "japanese_translation"
            if "英訳" in prompt:
                return "english_translation"
            return "english_reading"
        if qtype == "japanese":
            if "100" in prompt or "百字" in prompt:
                return "japanese_100chars"
            return "japanese_essay"
        return "symbol_short_answer"
