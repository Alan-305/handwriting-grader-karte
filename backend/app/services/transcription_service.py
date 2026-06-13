import logging

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.answer_transcription import (
    build_transcription_user_prompt,
    get_transcription_system,
    infer_transcription_profile,
)
from app.services.answer_parts import crop_filename, iter_crop_targets
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.session_service import SessionService

logger = logging.getLogger(__name__)


def _crop_key(order: int, part_index: int) -> str:
    return f"{order}-{part_index}"


def _resolve_crop_path(
    session: dict,
    *,
    teacher_id: str,
    session_id: str,
    target: dict,
    has_parts: bool,
) -> str | None:
    manual = session.get("manualCrops") or {}
    entry = manual.get(_crop_key(target["order"], target["partIndex"]))
    if entry and entry.get("croppedImagePath"):
        return entry["croppedImagePath"]
    filename = crop_filename(target["order"], target["partIndex"], has_parts)
    return f"teachers/{teacher_id}/sessions/{session_id}/crops/{filename}"


def _mock_transcription_text(profile: str, target: dict) -> str:
    label = target.get("partLabel") or f"第{target.get('order')}問"
    samples = {
        "symbol": f"{label} b（開発モード・Gemini未設定）",
        "japanese": f"{label} これは開発モードのサンプル転記です。実際の運用ではGemini APIキーを設定してください。",
        "english": f"{label} This is a sample transcription in development mode.",
        "mixed": f"{label} (1) sample answer",
    }
    return samples.get(profile, samples["mixed"])


class TranscriptionService:
    def __init__(self):
        self.session_svc = SessionService()
        self.firebase = FirebaseAdminService()
        self.gemini = GeminiAnalysisClient()

    def _load_transcription_context(
        self, session_id: str, teacher_id: str
    ) -> tuple[dict, list[dict], list[dict]]:
        session = self.session_svc.get_session(session_id)
        if not session or session.get("teacherId") != teacher_id:
            raise ValueError("セッションが見つかりません")

        questions = self.session_svc.get_questions_for_test(session["testId"])
        targets = iter_crop_targets(questions)
        if not targets:
            raise ValueError("採点対象の設問がありません")

        manual = session.get("manualCrops") or {}
        missing = [
            t
            for t in targets
            if not manual.get(_crop_key(t["order"], t["partIndex"]), {}).get(
                "croppedImagePath"
            )
        ]
        if missing:
            labels = [
                t.get("partLabel") or f"第{t.get('order')}問" for t in missing[:3]
            ]
            extra = f" ほか{len(missing) - 3}件" if len(missing) > 3 else ""
            raise ValueError(
                f"手動の切り出しが未設定です: {', '.join(labels)}{extra}。"
                " 切り出し画面で各設問の範囲を指定してください。"
            )
        return session, questions, targets

    def begin_transcription(self, session_id: str, teacher_id: str) -> dict:
        session, _, targets = self._load_transcription_context(session_id, teacher_id)
        if session.get("status") == "transcribing":
            logger.info("Restarting interrupted transcription for session %s", session_id)
        self.session_svc.clear_question_results(session_id)
        self.session_svc.update_status(session_id, "transcribing")
        return {"sessionId": session_id, "total": len(targets)}

    def transcribe_step(
        self, session_id: str, teacher_id: str, step_index: int
    ) -> dict:
        session, questions, targets = self._load_transcription_context(
            session_id, teacher_id
        )
        if session.get("status") not in ("transcribing", "crop_review"):
            raise ValueError("読み取りを開始できない状態です。切り出し画面からやり直してください。")
        if step_index < 0 or step_index >= len(targets):
            raise ValueError(f"設問インデックスが不正です: {step_index}")

        if session.get("status") != "transcribing":
            self.session_svc.update_status(session_id, "transcribing")

        target = targets[step_index]
        label = target.get("partLabel") or f"第{target.get('order')}問"
        self.session_svc.update_progress(
            session_id, step_index, len(targets), f"{label}を読み取り中"
        )

        q = next((x for x in questions if x["id"] == target["questionId"]), None)
        parts = (q or {}).get("answerParts") or []
        has_parts = len(parts) > 0
        crop_path = _resolve_crop_path(
            session,
            teacher_id=teacher_id,
            session_id=session_id,
            target=target,
            has_parts=has_parts,
        )
        crop_bytes = self.firebase.download_bytes(crop_path) if crop_path else None
        if not crop_bytes:
            raise ValueError(f"{label}の切り出し画像が見つかりません: {crop_path}")

        profile = infer_transcription_profile(target, q)
        system = get_transcription_system(profile)
        user_text = build_transcription_user_prompt(
            target=target, question=q, profile=profile
        )

        if self.gemini.model:
            try:
                text = self.gemini.transcribe_images(
                    system=system,
                    user_text=user_text,
                    images_jpeg=[crop_bytes],
                )
            except ValueError as exc:
                logger.warning("Transcription failed for %s: %s", crop_path, exc)
                text = (
                    f"{label}\n"
                    f"【読み取り未完了】{exc}\n"
                    "（下の欄で手入力してください）"
                )
        else:
            text = _mock_transcription_text(profile, target)

        result_data = {
            "questionId": target["questionId"],
            "order": target["order"],
            "partIndex": target["partIndex"],
            "partLabel": target.get("partLabel"),
            "type": target["type"],
            "answerFormat": target.get("answerFormat"),
            "questionAnswerFormat": target.get("questionAnswerFormat"),
            "partCount": target.get("partCount"),
            "croppedImagePath": crop_path,
            "studentAnswerText": text.strip(),
            "transcriptionStatus": "pending_review",
            "transcriptionProfile": profile,
            "modelAnswer": target.get("modelAnswer", ""),
            "maxPoints": float(target.get("points", 10)),
            "graded": False,
        }
        result_id = self.session_svc.save_question_result(session_id, result_data)
        result_data["id"] = result_id

        done = step_index >= len(targets) - 1
        if done:
            self.session_svc.dedupe_question_results(session_id)
            self.session_svc.update_status(
                session_id,
                "transcription_review",
                gradingProgress=None,
            )

        return {
            "sessionId": session_id,
            "stepIndex": step_index,
            "total": len(targets),
            "done": done,
            "result": result_data,
        }

    def transcribe_session(self, session_id: str, teacher_id: str) -> list[dict]:
        begin = self.begin_transcription(session_id, teacher_id)
        saved: list[dict] = []
        for i in range(begin["total"]):
            payload = self.transcribe_step(session_id, teacher_id, i)
            saved.append(payload["result"])
        return saved
