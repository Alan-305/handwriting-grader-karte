#!/usr/bin/env python3
"""過去問の answerFormat（解答方式）を Firestore 上で設定・修正する。

  backend/.venv/bin/python3 scripts/fix_past_exam_question_types.py --university todai --year 2026
  backend/.venv/bin/python3 scripts/fix_past_exam_question_types.py --university todai --year 2026 --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from app.services.past_exam_service import PastExamService  # noqa: E402
from app.utils.firebase_cli import bootstrap_firebase_from_env  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Set answerFormat on past questions in Firestore")
    parser.add_argument("--university", required=True, help="University slug, e.g. todai")
    parser.add_argument("--year", type=int, required=True, help="Exam year, e.g. 2026")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing")
    args = parser.parse_args()

    bootstrap_firebase_from_env()
    service = PastExamService()
    db = service.firebase.db()
    if not db:
        print("Firestore not initialized", file=sys.stderr)
        return 1

    exam_year_ref = (
        db.collection("universities")
        .document(args.university)
        .collection("exam_years")
        .document(str(args.year))
    )
    exam_year = exam_year_ref.get()
    exam_type = (exam_year.to_dict() or {}).get("examType", "英語") if exam_year.exists else "英語"

    questions_ref = (
        db.collection("universities")
        .document(args.university)
        .collection("past_questions")
    )
    docs = questions_ref.where("year", "==", args.year).stream()

    fixed = 0
    for doc in docs:
        data = doc.to_dict() or {}
        prompt = data.get("prompt", "")
        current_format = data.get("answerFormat")
        answer_format = PastExamService._infer_answer_format(prompt)
        grading_type = PastExamService._grading_type_for(answer_format, exam_type)
        profile = data.get("profile") or {}
        new_archetype = PastExamService._guess_archetype(
            grading_type, prompt, answer_format=answer_format
        )

        changes: list[str] = []
        if current_format != answer_format:
            changes.append(f"answerFormat: {current_format!r} -> {answer_format}")
        if data.get("type") != grading_type:
            changes.append(f"type: {data.get('type')!r} -> {grading_type}")
        if profile.get("archetype") != new_archetype:
            changes.append(f"archetype: {profile.get('archetype')!r} -> {new_archetype}")

        if not changes:
            continue

        major = data.get("majorOrder")
        part = data.get("partLabel", "")
        print(f"  {doc.id} (第{major}問{part})")
        for line in changes:
            print(f"    {line}")

        if not args.dry_run:
            profile["archetype"] = new_archetype
            doc.reference.update(
                {
                    "answerFormat": answer_format,
                    "type": grading_type,
                    "profile": profile,
                }
            )
        fixed += 1

    if fixed == 0:
        print("修正対象はありませんでした。")
    elif args.dry_run:
        print(f"dry-run: {fixed} 件を更新できます。--dry-run を外して実行してください。")
    else:
        print(f"{fixed} 件を更新しました。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
