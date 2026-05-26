#!/usr/bin/env python3
"""過去問PDFの一括インポート CLI。

macOS: backend/.venv/bin/python3 を使用（python コマンドは不可な場合あり）

【東大向け・3ファイル構成（推奨）】
  data/past-exams/universities/todai/2026/
    2026東大問題.pdf       … 脚本を除いた問題用紙
    2026東大解答.pdf       … 模範解答
    2026東大リスニング.pdf … 脚本のみ（listening.pdf でも可）

一括取り込み:
  npm run import:past-exam -- --university todai --year 2026

リスニングだけ別取り込み:
  npm run import:listening -- --university todai --year 2026
  npm run import:listening -- --university todai --year 2026 --from-draft --write-firestore
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from app.ai.gemini_client import normalize_gemini_model  # noqa: E402

os.environ["GEMINI_MODEL"] = normalize_gemini_model(os.getenv("GEMINI_MODEL"))

if not (os.getenv("HGK_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")):
    print("警告: GEMINI_API_KEY が .env に見つかりません。OCR・解析は失敗します。")

from app.services.past_exam_service import UNIVERSITY_REGISTRY, PastExamService  # noqa: E402
from app.utils.firebase_cli import bootstrap_firebase_from_env  # noqa: E402


def _print_listening_scripts(parsed) -> None:
    scripts = getattr(parsed, "listening_scripts", None) or []
    if not scripts:
        return
    print(f"Listening scripts: {len(scripts)} section(s)")
    for i, script in enumerate(scripts, start=1):
        title = script.title or f"脚本{i}"
        preview = script.content[:50].replace("\n", " ")
        print(f"  - {title}: {preview}...")


def _run_listening_only(service: PastExamService, args: argparse.Namespace) -> int:
    if args.from_listening_draft:
        parsed, listening_pdf = service.load_listening_draft_bundle(args.university, args.year)
    else:
        sources = service.resolve_sources(
            args.university,
            args.year,
            listening_pdf_path=args.listening_pdf,
            listening_only=True,
        )
        assert sources.listening_pdf is not None
        print(f"Listening PDF: {sources.listening_pdf}")
        parsed = service.parse_listening_pdf(
            university_slug=args.university,
            year=args.year,
            listening_pdf=sources.listening_pdf,
        )
        draft_path = service.save_listening_draft(
            args.university, args.year, parsed, sources.listening_pdf
        )
        print(f"Listening draft saved: {draft_path}")
        listening_pdf = sources.listening_pdf

    _print_listening_scripts(parsed)

    if args.write_firestore:
        if args.from_listening_draft:
            parsed, listening_pdf = service.load_listening_draft_bundle(args.university, args.year)
        result = service.write_listening_to_firestore(
            university_slug=args.university,
            year=args.year,
            parsed=parsed,
            listening_pdf=listening_pdf,
            upload_pdf=not args.no_upload_pdf,
        )
        print("Firestore listening import complete:")
        print(f"  scripts: {result['listeningScriptCount']}")
        if result.get("listeningPdfStoragePath"):
            print(f"  pdf: {result['listeningPdfStoragePath']}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Import university past exam PDF(s)")
    parser.add_argument("--university", required=True, help="University slug (e.g. todai)")
    parser.add_argument("--year", type=int, required=True, help="Exam year (e.g. 2026)")
    parser.add_argument("--pdf", action="append", dest="pdfs", help="Exam PDF (repeatable)")
    parser.add_argument("--answers-pdf", help="Model answers PDF")
    parser.add_argument("--listening-pdf", help="Listening script PDF")
    parser.add_argument(
        "--listening-only",
        action="store_true",
        help="Import listening script PDF only",
    )
    parser.add_argument("--write-firestore", action="store_true")
    parser.add_argument("--from-draft", action="store_true")
    parser.add_argument("--from-listening-draft", action="store_true")
    parser.add_argument("--no-upload-pdf", action="store_true")
    args = parser.parse_args()

    if args.write_firestore or args.from_draft or args.from_listening_draft:
        bootstrap_firebase_from_env(ROOT / ".env")
        print(f"Firebase connected (project: {os.getenv('FIREBASE_PROJECT_ID', '')})")

    service = PastExamService()

    if args.listening_only:
        return _run_listening_only(service, args)

    if args.from_draft:
        parsed, sources = service.load_draft_bundle(args.university, args.year)
    else:
        sources = service.resolve_sources(
            args.university,
            args.year,
            exam_pdf_paths=args.pdfs,
            answers_pdf_path=args.answers_pdf,
            listening_pdf_path=args.listening_pdf,
        )
        print("Exam PDF(s):")
        for p in sources.exam_pdfs:
            print(f"  - {p}")
        print(f"Answers PDF: {sources.answers_pdf or '(none)'}")
        if sources.listening_pdf:
            print(f"Listening PDF: {sources.listening_pdf}")
        elif UNIVERSITY_REGISTRY.get(args.university, {}).get("expectsListening"):
            print("Listening PDF: (none — 脚本別PDFを置くか --listening-only で後から取り込み)")

        parsed = service.parse_sources(
            university_slug=args.university,
            year=args.year,
            sources=sources,
        )
        draft_path = service.save_draft(args.university, args.year, parsed, sources)
        print(f"Draft saved: {draft_path}")
        print(f"Parsed {len(parsed.questions)} question(s).")

    for q in parsed.questions:
        label = f"第{q.major_order}問"
        if q.part_label:
            label += q.part_label
        preview = q.prompt[:60].replace("\n", " ")
        answer_mark = "✓" if q.model_answer.strip() else "—"
        print(f"  - {label} [{q.type}] 模範解答:{answer_mark} {preview}...")

    _print_listening_scripts(parsed)

    if args.write_firestore:
        result = service.write_to_firestore(
            university_slug=args.university,
            year=args.year,
            parsed=parsed,
            sources=sources,
            upload_pdf=not args.no_upload_pdf,
        )
        print("Firestore write complete:")
        print(f"  questions: {', '.join(result['questionIds'])}")
        if result.get("listeningPdfStoragePath"):
            print(f"  listening pdf: {result['listeningPdfStoragePath']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
