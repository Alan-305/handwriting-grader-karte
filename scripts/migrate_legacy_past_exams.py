#!/usr/bin/env python3
"""旧共有パス (universities/...) の過去問を教師専用パスへ移行する。

Firestore:
  universities/{slug}/exam_years/*     -> teachers/{uid}/past_exam_catalog/{slug}/exam_years/*
  universities/{slug}/past_questions/* -> teachers/{uid}/past_exam_catalog/{slug}/past_questions/*

Storage:
  platform/universities/{slug}/past-exams/{year}/* -> teachers/{uid}/past-exams/{slug}/{year}/*

旧データは削除せず残す（ルール上クライアントからは不可）。--dry-run で確認可能。
"""

from __future__ import annotations

import argparse
import os
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from app.services.past_exam_service import PastExamService  # noqa: E402
from app.utils.firebase_cli import bootstrap_firebase_from_env  # noqa: E402

PAST_EXAM_CATALOG = PastExamService.PAST_EXAM_CATALOG

STORAGE_PATH_KEYS = (
    "sourcePdfPaths",
    "sourceAnswersPdfPath",
    "sourceListeningPdfPath",
    "sourceAnalysisPdfPath",
)


def _normalize_storage_path(raw: str) -> str:
    path = (raw or "").strip()
    if path.startswith("gs://"):
        without_scheme = path[5:]
        parts = without_scheme.split("/", 1)
        return parts[1] if len(parts) == 2 else without_scheme
    return path.lstrip("/")


def _legacy_storage_prefix(university_slug: str, year: int) -> str:
    return f"platform/universities/{university_slug}/past-exams/{year}"


def _teacher_storage_prefix(teacher_id: str, university_slug: str, year: int) -> str:
    return f"teachers/{teacher_id}/past-exams/{university_slug}/{year}"


def _remap_storage_path(
    old_path: str,
    *,
    teacher_id: str,
    university_slug: str,
    year: int,
    firebase,
    dry_run: bool,
) -> str | None:
    normalized = _normalize_storage_path(old_path)
    if not normalized:
        return None
    legacy_prefix = _legacy_storage_prefix(university_slug, year)
    new_prefix = _teacher_storage_prefix(teacher_id, university_slug, year)

    if normalized.startswith(new_prefix):
        return normalized

    if normalized.startswith(legacy_prefix):
        suffix = normalized[len(legacy_prefix) :].lstrip("/")
        new_path = f"{new_prefix}/{suffix}" if suffix else new_prefix
    elif normalized.startswith("platform/universities/"):
        filename = Path(normalized).name
        new_path = f"{new_prefix}/{filename}"
    else:
        filename = Path(normalized).name
        new_path = f"{new_prefix}/{filename}"

    if dry_run:
        print(f"    storage: {normalized} -> {new_path}")
        return new_path

    data = firebase.download_bytes(normalized)
    if data is None:
        print(f"    WARN: storage object missing: {normalized}", file=sys.stderr)
        return new_path

    content_type = "application/pdf"
    if new_path.endswith(".json"):
        content_type = "application/json"
    firebase.upload_bytes(new_path, data, content_type=content_type)
    print(f"    storage copied: {normalized} -> {new_path}")
    return new_path


def _remap_doc_storage_fields(
    doc: dict,
    *,
    teacher_id: str,
    university_slug: str,
    year: int,
    firebase,
    dry_run: bool,
) -> dict:
    out = deepcopy(doc)
    for key in STORAGE_PATH_KEYS:
        if key not in out or out[key] is None:
            continue
        if key == "sourcePdfPaths":
            paths = out.get("sourcePdfPaths") or []
            remapped = []
            for p in paths:
                new_p = _remap_storage_path(
                    str(p),
                    teacher_id=teacher_id,
                    university_slug=university_slug,
                    year=year,
                    firebase=firebase,
                    dry_run=dry_run,
                )
                if new_p:
                    remapped.append(new_p)
            out["sourcePdfPaths"] = remapped
        else:
            new_p = _remap_storage_path(
                str(out[key]),
                teacher_id=teacher_id,
                university_slug=university_slug,
                year=year,
                firebase=firebase,
                dry_run=dry_run,
            )
            if new_p:
                out[key] = new_p
    return out


def _dest_path(teacher_id: str, university_slug: str, *segments: str) -> list[str]:
    return ["teachers", teacher_id, PAST_EXAM_CATALOG, university_slug, *segments]


def migrate_university(
    *,
    teacher_id: str,
    university_slug: str,
    firebase,
    dry_run: bool,
) -> dict:
    db = firebase.db()
    stats = {"exam_years": 0, "past_questions": 0}

    exam_years_ref = (
        db.collection("universities")
        .document(university_slug)
        .collection("exam_years")
    )
    questions_ref = (
        db.collection("universities")
        .document(university_slug)
        .collection("past_questions")
    )

    exam_year_docs = list(exam_years_ref.stream())
    question_docs = list(questions_ref.stream())

    if not exam_year_docs and not question_docs:
        return stats

    print(
        f"\n==> {university_slug}: exam_years={len(exam_year_docs)} "
        f"past_questions={len(question_docs)}"
    )

    now = datetime.now(timezone.utc)

    for snap in exam_year_docs:
        data = snap.to_dict() or {}
        year = int(data.get("year") or snap.id or 0)
        payload = _remap_doc_storage_fields(
            data,
            teacher_id=teacher_id,
            university_slug=university_slug,
            year=year,
            firebase=firebase,
            dry_run=dry_run,
        )
        payload["teacherId"] = teacher_id
        payload["universitySlug"] = university_slug
        payload["migratedFrom"] = "universities"
        payload["migratedAt"] = now
        if dry_run:
            print(f"  exam_year {snap.id}: would write to teacher catalog")
        else:
            firebase.set_nested_doc(
                _dest_path(teacher_id, university_slug, "exam_years", snap.id),
                payload,
                merge=True,
            )
            print(f"  exam_year {snap.id}: migrated")
        stats["exam_years"] += 1

    for snap in question_docs:
        data = snap.to_dict() or {}
        payload = deepcopy(data)
        payload["teacherId"] = teacher_id
        payload["universitySlug"] = university_slug
        payload["migratedFrom"] = "universities"
        payload["migratedAt"] = now
        if dry_run:
            print(f"  past_question {snap.id}: would write to teacher catalog")
        else:
            firebase.set_nested_doc(
                _dest_path(teacher_id, university_slug, "past_questions", snap.id),
                payload,
                merge=True,
            )
            print(f"  past_question {snap.id}: migrated")
        stats["past_questions"] += 1

    return stats


def list_legacy_university_slugs(db) -> list[str]:
    slugs: set[str] = set()
    for uni_snap in db.collection("universities").stream():
        slug = uni_snap.id
        ey = list(
            db.collection("universities")
            .document(slug)
            .collection("exam_years")
            .limit(1)
            .stream()
        )
        pq = list(
            db.collection("universities")
            .document(slug)
            .collection("past_questions")
            .limit(1)
            .stream()
        )
        if ey or pq:
            slugs.add(slug)
    return sorted(slugs)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migrate legacy shared past exams to a teacher catalog"
    )
    parser.add_argument("--teacher-id", required=True, help="Owner teacher Firebase Auth UID")
    parser.add_argument(
        "--university",
        action="append",
        dest="universities",
        help="University slug (repeatable). Default: all with legacy data",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing")
    args = parser.parse_args()

    teacher_id = args.teacher_id.strip()
    if not teacher_id:
        print("Error: --teacher-id is required", file=sys.stderr)
        return 1

    bootstrap_firebase_from_env(ROOT / ".env")
    print(f"Firebase project: {os.getenv('FIREBASE_PROJECT_ID', '')}")
    print(f"Target teacher: {teacher_id}")
    if args.dry_run:
        print("DRY RUN — no writes")

    from app.services.firebase_admin_service import FirebaseAdminService

    firebase = FirebaseAdminService()
    db = firebase.db()
    if not db:
        print("Error: Firestore unavailable", file=sys.stderr)
        return 1

    slugs = args.universities or list_legacy_university_slugs(db)
    if not slugs:
        print("No legacy past exam data found under universities/*/exam_years or past_questions")
        return 0

    print(f"Universities to migrate: {', '.join(slugs)}")

    totals = {"exam_years": 0, "past_questions": 0}
    for slug in slugs:
        PastExamService().ensure_university(slug)
        stats = migrate_university(
            teacher_id=teacher_id,
            university_slug=slug,
            firebase=firebase,
            dry_run=args.dry_run,
        )
        totals["exam_years"] += stats["exam_years"]
        totals["past_questions"] += stats["past_questions"]

    print(
        f"\nDone. exam_years={totals['exam_years']} past_questions={totals['past_questions']}"
        + (" (dry run)" if args.dry_run else "")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
