import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where, type Timestamp } from "firebase/firestore";
import { History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useInterviewRecords, useSessionsForStudent } from "@/hooks/useSession";
import { getDb } from "@/lib/firebase";
import type { Session, SessionStatus, Test } from "@/types/firestore";

const STATUS_LABEL: Partial<Record<SessionStatus, string>> = {
  uploaded: "アップロード済",
  aligning: "位置合わせ中",
  aligned: "位置合わせ済",
  crop_review: "切り出し確認中",
  transcribing: "読み取り中",
  transcription_review: "転記確認中",
  grading: "添削中",
  review: "添削確認待ち",
  completed: "完了",
};

function formatTs(ts: Timestamp | undefined): string {
  if (!ts?.toDate) return "—";
  const d = ts.toDate();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatInterviewTs(ts: Timestamp | undefined): string {
  if (!ts?.toDate) return "—";
  const d = ts.toDate();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface StudentHistoryModalProps {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
}

export function StudentHistoryModal({ open, onClose, studentId, studentName }: StudentHistoryModalProps) {
  const { user } = useAuth();
  const sessions = useSessionsForStudent(open ? studentId : undefined);
  const interviewRecords = useInterviewRecords(open ? studentId : undefined);
  const [testsById, setTestsById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !user) return;
    const q = query(collection(getDb(), "tests"), where("teacherId", "==", user.uid));
    return onSnapshot(q, (snap) => {
      const m: Record<string, string> = {};
      snap.docs.forEach((d) => {
        const t = d.data() as Test;
        m[d.id] = t.title || "（無題）";
      });
      setTestsById(m);
    });
  }, [open, user]);

  const sessionsChrono = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const ta = a.sessionDate?.toMillis?.() ?? 0;
      const tb = b.sessionDate?.toMillis?.() ?? 0;
      return ta - tb;
    });
  }, [sessions]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/40 p-0 sm:items-start sm:overflow-y-auto sm:p-4 sm:pt-12 md:pt-20"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-history-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="relative flex max-h-[min(100dvh,100%)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl shadow-lg sm:max-h-[min(90dvh,720px)] sm:rounded-xl">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 min-h-11 min-w-11"
          onClick={onClose}
          aria-label="閉じる"
        >
          <X className="h-5 w-5" />
        </Button>
        <CardHeader className="pr-14">
          <CardTitle id="student-history-title" className="flex items-center gap-2 font-ja text-lg">
            <History className="h-5 w-5 shrink-0" />
            {studentName} — 過去の添削・面談
          </CardTitle>
          <CardDescription className="font-ja leading-relaxed">
            添削は<strong>第何回目のテスト</strong>として時系列で並んでいます。結果画面では各問の<strong>解説</strong>と、生成済みなら
            <strong>過去問アドバイス</strong>も確認できます。面談は<strong>第何回目の面談</strong>で相談・アドバイス記録を開きます。
          </CardDescription>
        </CardHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-6">
          <section>
            <h3 className="mb-2 font-ja text-sm font-semibold text-slate-800">添削セッション（テスト）</h3>
            {sessionsChrono.length === 0 ? (
              <p className="font-ja text-sm text-slate-500">まだ添削セッションがありません。</p>
            ) : (
              <ul className="space-y-2">
                {sessionsChrono.map((s: Session, idx: number) => {
                  const n = idx + 1;
                  const title = s.testId ? testsById[s.testId] ?? "（テスト読込中…）" : "（テスト未設定）";
                  const score =
                    s.maxScore > 0 ? `${s.totalScore ?? 0} / ${s.maxScore}点` : "得点未反映";
                  const status = STATUS_LABEL[s.status] ?? s.status;
                  return (
                    <li
                      key={s.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 font-ja text-sm"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          第{n}回のテスト
                          <span className="ml-2 font-normal text-slate-500">（{formatTs(s.sessionDate)}）</span>
                        </span>
                        <span className="text-xs text-slate-500">{status}</span>
                      </div>
                      <p className="mt-1 text-slate-700">{title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{score}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild size="sm" className="min-h-10">
                          <Link to={`/sessions/${s.id}`} onClick={onClose}>
                            添削結果・解説を見る
                          </Link>
                        </Button>
                        {s.gradingConfirmedAt ? (
                          <Button asChild variant="outline" size="sm" className="min-h-10">
                            <Link to={`/sessions/${s.id}/print/student`} onClick={onClose}>
                              返却プリント
                            </Link>
                          </Button>
                        ) : (
                          <span className="inline-flex min-h-10 items-center rounded-md border border-dashed border-slate-200 px-3 font-ja text-xs text-slate-400">
                            返却プリント（添削確定後）
                          </span>
                        )}
                        <Button asChild variant="outline" size="sm" className="min-h-10">
                          <Link to={`/sessions/${s.id}/print/teacher`} onClick={onClose}>
                            教師用資料
                          </Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-ja text-sm font-semibold text-slate-800">面談（相談・アドバイス記録）</h3>
            {interviewRecords.length === 0 ? (
              <p className="font-ja text-sm text-slate-500">まだ面談記録がありません。</p>
            ) : (
              <ul className="space-y-2">
                {interviewRecords.map((rec) => (
                  <li
                    key={rec.id}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-3 font-ja text-sm"
                  >
                    <div className="font-semibold text-slate-900">
                      第{rec.recordNumber}回の面談
                      <span className="ml-2 font-normal text-slate-500">
                        （{formatInterviewTs(rec.conductedAt)}）
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                      相談: {(rec.studentConsultation || "").slice(0, 80)}
                      {(rec.studentConsultation || "").length > 80 ? "…" : ""}
                    </p>
                    <div className="mt-2">
                      <Button asChild size="sm" variant="outline" className="min-h-10">
                        <Link to={`/students/${studentId}/interview?record=${rec.id}`} onClick={onClose}>
                          この回の面談を開く
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Card>
    </div>
  );
}
