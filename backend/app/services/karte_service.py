import logging
from collections import Counter
from datetime import datetime, timezone

from app.ai.gemini_client import GeminiAnalysisClient
from app.ai.prompts.karte_stages import (
    ADVICE_PLAN_SYSTEM,
    DIAGNOSIS_SYSTEM,
    INTEGRITY_SYSTEM,
    READINESS_SYSTEM,
    build_advice_plan_prompt,
    build_context_block,
    build_diagnosis_prompt,
    build_integrity_prompt,
    build_readiness_prompt,
    to_json,
)
from app.ai.schemas.karte import (
    AdvicePlanResult,
    DiagnosisResult,
    IntegrityCheck,
    ReadinessResult,
)
from app.services.error_tags import categorize_error_tag
from app.services.firebase_admin_service import FirebaseAdminService
from app.services.karte_aggregation import dedupe_completed_for_karte
from app.services.session_service import SessionService
from app.utils.json_helpers import to_json_safe

logger = logging.getLogger(__name__)

KARTE_ANALYSIS_TOTAL_STEPS = 4
KARTE_ANALYSIS_STAGE_LABELS = (
    "弱点診断",
    "志望校ギャップ分析",
    "指導プラン生成",
    "整合チェックと保存",
)


class KarteService:
    def __init__(self):
        self.firebase = FirebaseAdminService()
        self.session_service = SessionService()
        self.gemini = GeminiAnalysisClient()

    def _error_tags_for_session(self, db, session_id: str) -> dict[str, int]:
        counter: Counter = Counter()
        for r in (
            db.collection("sessions")
            .document(session_id)
            .collection("question_results")
            .stream()
        ):
            data = r.to_dict() or {}
            for tag in data.get("errorTags") or []:
                if isinstance(tag, str) and tag.strip():
                    counter[categorize_error_tag(tag.strip())] += 1
        return dict(counter)

    def aggregate_generalized_error_tags(self, student_id: str, teacher_id: str) -> dict[str, int]:
        """第1回〜最新回まで、添削完了テスト（同一testIdは最新のみ）のエラーを一般化カテゴリで累積。"""
        sessions = self.firebase.query_collection("sessions", "studentId", "==", student_id)
        sessions = [s for s in sessions if s.get("teacherId") == teacher_id]
        completed = dedupe_completed_for_karte(sessions)
        counter: Counter = Counter()
        db = self.firebase.db()
        if not db:
            return {}
        for sess in completed:
            for cat, count in self._error_tags_for_session(db, sess["id"]).items():
                counter[cat] += count
        return dict(counter)

    def aggregate_error_tags_by_session(
        self, student_id: str, teacher_id: str
    ) -> list[dict]:
        """時系列順に、テストごとの一般化ミス傾向（第1回が先頭）。"""
        sessions = self.firebase.query_collection("sessions", "studentId", "==", student_id)
        sessions = [s for s in sessions if s.get("teacherId") == teacher_id]
        completed = dedupe_completed_for_karte(sessions)
        db = self.firebase.db()
        if not db:
            return []
        blocks: list[dict] = []
        for order, sess in enumerate(completed, start=1):
            freq = self._error_tags_for_session(db, sess["id"])
            tags = sorted(freq.items(), key=lambda x: (-x[1], x[0]))
            blocks.append(
                {
                    "order": order,
                    "sessionId": sess["id"],
                    "tags": [{"tag": t, "count": c} for t, c in tags],
                }
            )
        return blocks

    def build_session_summaries(self, student_id: str, teacher_id: str) -> tuple[str, list[str]]:
        sessions = self.firebase.query_collection("sessions", "studentId", "==", student_id)
        sessions = [s for s in sessions if s.get("teacherId") == teacher_id]
        completed = dedupe_completed_for_karte(sessions)
        lines = []
        session_ids = []
        db = self.firebase.db()
        for sess in completed:
            sid = sess["id"]
            session_ids.append(sid)
            score = sess.get("totalScore", 0)
            max_score = sess.get("maxScore", 0)
            line = f"Session {sid}: {score}/{max_score}点"
            if db:
                results = db.collection("sessions").document(sid).collection("question_results").stream()
                grades = [r.to_dict().get("grade", "?") for r in results]
                line += f" 評価:{','.join(grades)}"
            lines.append(line)
        return "\n".join(lines) or "セッション履歴なし", session_ids

    def update_aggregated_stats(self, student_id: str, teacher_id: str):
        sessions = self.firebase.query_collection("sessions", "studentId", "==", student_id)
        sessions = [s for s in sessions if s.get("teacherId") == teacher_id]
        completed = dedupe_completed_for_karte(sessions)
        score_history = [
            {
                "sessionId": s["id"],
                "date": s.get("sessionDate"),
                "totalScore": s.get("totalScore", 0),
                "maxScore": s.get("maxScore", 0),
            }
            for s in completed
        ]
        error_freq = self.aggregate_generalized_error_tags(student_id, teacher_id)
        top_errors = sorted(error_freq.items(), key=lambda x: (-x[1], x[0]))[:12]
        error_by_session = self.aggregate_error_tags_by_session(student_id, teacher_id)

        db = self.firebase.db()

        type_acc = {"english": [], "japanese": [], "symbol": []}
        if db:
            for sess in completed:
                results = (
                    db.collection("sessions")
                    .document(sess["id"])
                    .collection("question_results")
                    .stream()
                )
                for r in results:
                    data = r.to_dict()
                    qtype = data.get("type", "english")
                    max_pts = data.get("maxPoints", 1) or 1
                    acc = (data.get("score", 0) / max_pts) * 100
                    if qtype in type_acc:
                        type_acc[qtype].append(acc)

        stats = {
            "totalSessions": len(completed),
            "scoreHistory": score_history,
            "questionTypeAccuracy": type_acc,
            "topErrorTags": [{"tag": t, "count": c} for t, c in top_errors],
            "errorTagsBySession": error_by_session,
            "lastUpdated": datetime.now(timezone.utc),
        }
        self.firebase.set_doc("students", student_id, {}, merge=True)
        if db:
            db.collection("students").document(student_id).collection("stats").document("aggregated").set(stats)

    def _build_karte_context(self, student_id: str, teacher_id: str) -> dict:
        """Stage 0: 決定論的集計を含む、全ステージ共通の入力コンテキストを構築。"""
        student = self.firebase.get_doc("students", student_id) or {}
        if student.get("teacherId") != teacher_id:
            raise PermissionError("Access denied")

        error_stats = self.aggregate_generalized_error_tags(student_id, teacher_id)
        error_by_session = self.aggregate_error_tags_by_session(student_id, teacher_id)
        summaries, session_ids = self.build_session_summaries(student_id, teacher_id)

        interview = student.get("interviewProfile") or {}
        interview_records = self.firebase.get_subcollection(
            ["students", student_id, "interview_records"]
        )
        interview_records.sort(key=lambda r: r.get("recordNumber") or 0)

        target_refs = interview.get("targetUniversities") or student.get("targetUniversities", [])
        if not target_refs and interview_records:
            target_refs = interview_records[-1].get("targetUniversities", [])

        target_unis = []
        for tu in target_refs:
            uni = self.firebase.get_doc("target_universities", tu.get("universityId", ""))
            if uni:
                merged = {**uni, "priority": tu.get("priority", 1)}
                target_unis.append(merged)
            else:
                target_unis.append(tu)

        context_block = build_context_block(
            student_name=student.get("name", ""),
            target_universities=target_unis,
            session_summaries=summaries,
            error_stats=error_stats,
            interview_profile=interview or None,
            interview_records=interview_records or None,
            error_by_session=error_by_session or None,
        )

        return {
            "student": student,
            "error_stats": error_stats,
            "session_ids": session_ids,
            "target_unis": target_unis,
            "interview_profile": interview,
            "context_block": context_block,
        }

    def _run_diagnosis(self, ctx: dict) -> DiagnosisResult:
        return self._run_karte_stage(
            "弱点診断",
            lambda: self.gemini.complete_structured(
                system=DIAGNOSIS_SYSTEM,
                user_text=build_diagnosis_prompt(ctx["context_block"]),
                response_schema=DiagnosisResult,
                max_output_tokens=8192,
            ),
        )

    def _run_readiness(self, ctx: dict, diagnosis: DiagnosisResult) -> ReadinessResult:
        return self._run_karte_stage(
            "志望校ギャップ分析",
            lambda: self.gemini.complete_structured(
                system=READINESS_SYSTEM,
                user_text=build_readiness_prompt(ctx["context_block"], to_json(diagnosis)),
                response_schema=ReadinessResult,
                max_output_tokens=8192,
            ),
        )

    def _run_advice_plan(
        self, ctx: dict, diagnosis: DiagnosisResult, readiness: ReadinessResult
    ) -> AdvicePlanResult:
        return self._run_karte_stage(
            "指導プラン生成",
            lambda: self.gemini.complete_structured(
                system=ADVICE_PLAN_SYSTEM,
                user_text=build_advice_plan_prompt(
                    ctx["context_block"], to_json(diagnosis), to_json(readiness)
                ),
                response_schema=AdvicePlanResult,
                max_output_tokens=8192,
            ),
        )

    @staticmethod
    def _run_karte_stage(stage_label: str, call):
        """段ごとの失敗をログ・例外メッセージで特定しやすくする。"""
        try:
            return call()
        except Exception as exc:
            logger.exception("Karte stage failed: %s", stage_label)
            raise RuntimeError(f"カルテ分析（{stage_label}）に失敗しました: {exc}") from exc

    def _run_integrity_check(
        self,
        ctx: dict,
        diagnosis: DiagnosisResult,
        readiness: ReadinessResult,
        plan: AdvicePlanResult,
    ) -> IntegrityCheck:
        """Stage 4: 自己検証。検証自体が失敗しても保存をブロックしない。"""
        try:
            return self.gemini.complete_structured(
                system=INTEGRITY_SYSTEM,
                user_text=build_integrity_prompt(
                    allowed_universities=ctx["target_unis"],
                    diagnosis_json=to_json(diagnosis),
                    readiness_json=to_json(readiness),
                    advice_plan_json=to_json(plan),
                    common_test_scores=(ctx.get("interview_profile") or {}).get("commonTestScores"),
                    interview_profile=ctx.get("interview_profile"),
                ),
                response_schema=IntegrityCheck,
            )
        except Exception:
            logger.warning("Integrity check failed; saving snapshot without verification", exc_info=True)
            return IntegrityCheck(passed=True, violations=[], fabrication_risk=[])

    def _analysis_job_path(self, student_id: str) -> list[str]:
        return ["students", student_id, "karte_analysis_jobs", "active"]

    def _ctx_from_job(self, job: dict) -> dict:
        stored = job.get("context") or {}
        return {
            "context_block": stored.get("context_block", ""),
            "session_ids": stored.get("session_ids", []),
            "error_stats": stored.get("error_stats", {}),
            "target_unis": stored.get("target_unis", []),
            "interview_profile": stored.get("interview_profile") or {},
        }

    def _load_analysis_job(self, student_id: str, teacher_id: str) -> dict:
        job = self.firebase.get_nested_doc(self._analysis_job_path(student_id))
        if not job:
            raise ValueError("カルテ分析が開始されていません。もう一度「AI分析を実行」を押してください。")
        if job.get("teacherId") != teacher_id:
            raise PermissionError("Access denied")
        return job

    def begin_analysis(self, student_id: str, teacher_id: str) -> dict:
        """カルテ分析の第1段前準備。Hosting 60秒制限を避けるため段階実行の入口。"""
        ctx = self._build_karte_context(student_id, teacher_id)
        job = {
            "teacherId": teacher_id,
            "status": "running",
            "total": KARTE_ANALYSIS_TOTAL_STEPS,
            "context": to_json_safe(
                {
                    "context_block": ctx["context_block"],
                    "session_ids": ctx["session_ids"],
                    "error_stats": ctx["error_stats"],
                    "target_unis": ctx["target_unis"],
                    "interview_profile": ctx.get("interview_profile") or {},
                }
            ),
            "startedAt": datetime.now(timezone.utc),
        }
        self.firebase.set_nested_doc(self._analysis_job_path(student_id), job)
        return {
            "studentId": student_id,
            "total": KARTE_ANALYSIS_TOTAL_STEPS,
            "message": KARTE_ANALYSIS_STAGE_LABELS[0],
        }

    @staticmethod
    def _analysis_step_payload(
        student_id: str,
        step_index: int,
        *,
        done: bool,
        message: str,
        snapshot: dict | None = None,
    ) -> dict:
        payload = {
            "studentId": student_id,
            "stepIndex": step_index,
            "total": KARTE_ANALYSIS_TOTAL_STEPS,
            "done": done,
            "message": message,
        }
        if snapshot is not None:
            payload["snapshot"] = snapshot
        return payload

    def _assemble_snapshot(
        self,
        ctx: dict,
        diagnosis: DiagnosisResult,
        readiness: ReadinessResult,
        plan: AdvicePlanResult,
        integrity: IntegrityCheck,
    ) -> dict:
        integrity_warnings = list(integrity.violations) + list(integrity.fabrication_risk)
        return {
            "generatedAt": datetime.now(timezone.utc),
            "sessionIdsIncluded": ctx["session_ids"],
            "sessionCount": len(ctx["session_ids"]),
            "schemaVersion": 2,
            "reviewStatus": "draft",
            "weaknessSummary": diagnosis.weakness_summary,
            "errorFrequency": ctx["error_stats"],
            "adviceCards": [c.model_dump() for c in plan.advice_cards],
            "readinessComment": readiness.readiness_comment,
            "geminiModel": self.gemini.model_name if self.gemini.model else "gemini",
            "integrityPassed": integrity.passed,
            "integrityWarnings": integrity_warnings,
            "stages": {
                "diagnosis": diagnosis.model_dump(by_alias=True),
                "readiness": readiness.model_dump(by_alias=True),
                "plan": plan.model_dump(by_alias=True),
                "integrity": integrity.model_dump(by_alias=True),
            },
        }

    def analysis_step(self, student_id: str, teacher_id: str, step_index: int) -> dict:
        if step_index < 0 or step_index >= KARTE_ANALYSIS_TOTAL_STEPS:
            raise ValueError(f"stepIndex が不正です: {step_index}")

        job = self._load_analysis_job(student_id, teacher_id)
        ctx = self._ctx_from_job(job)

        if step_index == 0:
            diagnosis = self._run_diagnosis(ctx)
            job["diagnosis"] = diagnosis.model_dump(by_alias=True)
            self.firebase.set_nested_doc(self._analysis_job_path(student_id), job, merge=True)
            return self._analysis_step_payload(
                student_id,
                step_index,
                done=False,
                message=KARTE_ANALYSIS_STAGE_LABELS[1],
            )

        if step_index == 1:
            diagnosis = DiagnosisResult.model_validate(job.get("diagnosis") or {})
            readiness = self._run_readiness(ctx, diagnosis)
            job["readiness"] = readiness.model_dump(by_alias=True)
            self.firebase.set_nested_doc(self._analysis_job_path(student_id), job, merge=True)
            return self._analysis_step_payload(
                student_id,
                step_index,
                done=False,
                message=KARTE_ANALYSIS_STAGE_LABELS[2],
            )

        if step_index == 2:
            diagnosis = DiagnosisResult.model_validate(job.get("diagnosis") or {})
            readiness = ReadinessResult.model_validate(job.get("readiness") or {})
            plan = self._run_advice_plan(ctx, diagnosis, readiness)
            job["plan"] = plan.model_dump(by_alias=True)
            self.firebase.set_nested_doc(self._analysis_job_path(student_id), job, merge=True)
            return self._analysis_step_payload(
                student_id,
                step_index,
                done=False,
                message=KARTE_ANALYSIS_STAGE_LABELS[3],
            )

        diagnosis = DiagnosisResult.model_validate(job.get("diagnosis") or {})
        readiness = ReadinessResult.model_validate(job.get("readiness") or {})
        plan = AdvicePlanResult.model_validate(job.get("plan") or {})
        integrity = self._run_integrity_check(ctx, diagnosis, readiness, plan)
        snapshot = self._assemble_snapshot(ctx, diagnosis, readiness, plan, integrity)
        snapshot_id = self.firebase.add_subdoc(
            ["students", student_id, "karte_snapshots"],
            snapshot,
        )
        self.update_aggregated_stats(student_id, teacher_id)
        snapshot["id"] = snapshot_id
        self.firebase.delete_nested_doc(self._analysis_job_path(student_id))
        return self._analysis_step_payload(
            student_id,
            step_index,
            done=True,
            message="完了",
            snapshot=to_json_safe(snapshot),
        )

    def analyze_student(self, student_id: str, teacher_id: str) -> dict:
        """多段カルテ分析（一括）。段階 API と同じ処理を連続実行する。"""
        self.begin_analysis(student_id, teacher_id)
        result: dict | None = None
        for step_index in range(KARTE_ANALYSIS_TOTAL_STEPS):
            result = self.analysis_step(student_id, teacher_id, step_index)
        if not result or not result.get("snapshot"):
            raise RuntimeError("カルテ分析の結果を保存できませんでした。")
        return result["snapshot"]
