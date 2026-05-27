import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { ArrowLeft, Check, Plus, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { SafeForm } from "@/components/forms/SafeForm";
import { profileFromStudent } from "@/components/students/StudentProfileFields";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useInterviewRecords } from "@/hooks/useSession";
import { getDb } from "@/lib/firebase";
import type { Student, StudentInterviewRecord } from "@/types/firestore";

function formatConductedAt(ts: Timestamp | undefined): string {
  if (!ts?.toDate) return "日時未設定";
  const d = ts.toDate();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function StudentInterviewPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [student, setStudent] = useState<Student | null>(null);
  const [studentConsultation, setStudentConsultation] = useState("");
  const [teacherAdvice, setTeacherAdvice] = useState("");
  const [viewingRecordId, setViewingRecordId] = useState<string | "new">("new");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const records = useInterviewRecords(studentId);

  useEffect(() => {
    if (!studentId) return;
    return onSnapshot(doc(getDb(), "students", studentId), (snap) => {
      if (!snap.exists()) return;
      setStudent({ id: snap.id, ...snap.data() } as Student);
    });
  }, [studentId]);

  const openRecord = useCallback((rec: StudentInterviewRecord) => {
    setViewingRecordId(rec.id);
    setStudentConsultation(rec.studentConsultation ?? "");
    setTeacherAdvice(rec.teacherAdvice ?? "");
  }, []);

  useEffect(() => {
    const rid = searchParams.get("record");
    if (!rid || records.length === 0) return;
    const rec = records.find((r) => r.id === rid);
    if (!rec) return;
    if (viewingRecordId === rec.id) return;
    openRecord(rec);
  }, [searchParams, records, viewingRecordId, openRecord]);

  const startNewInterview = () => {
    setViewingRecordId("new");
    setStudentConsultation("");
    setTeacherAdvice("");
    setSearchParams(
      (p) => {
        p.delete("record");
        return p;
      },
      { replace: true },
    );
  };

  const isReadOnly = viewingRecordId !== "new";
  const profileSummary = student
    ? profileFromStudent(student.interviewProfile, student.targetUniversities)
    : null;

  const handleSave = async () => {
    if (!studentId || !student || isReadOnly) return;
    if (!studentConsultation.trim() && !teacherAdvice.trim()) {
      setError("生徒の相談内容または教師のアドバイスのどちらかを入力してください");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const snapshot = profileFromStudent(student.interviewProfile, student.targetUniversities);
      const recordNumber = records.length + 1;
      await addDoc(collection(getDb(), "students", studentId, "interview_records"), {
        conductedAt: serverTimestamp(),
        recordNumber,
        studentConsultation: studentConsultation.trim(),
        teacherAdvice: teacherAdvice.trim(),
        targetUniversities: snapshot.targetUniversities,
        commonTestYear: snapshot.commonTestYear,
        commonTestScores: snapshot.commonTestScores,
        confirmedFactIds: snapshot.confirmedFactIds,
        createdAt: serverTimestamp(),
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      startNewInterview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (!student) {
    return (
      <div>
        <PageHeader title="面談記録" description="読み込み中..." />
        <p className="page-content font-ja text-slate-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`${student.name} — 面談記録`}
        description="テスト返却のたびに相談内容と教師アドバイスのみ記録（基本情報は別画面）"
      />
      <div className="page-content mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to={`/students/${studentId}/dashboard`}>
              <ArrowLeft className="h-4 w-4" />
              カルテに戻る
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/students/${studentId}/profile`}>基本情報を編集</Link>
          </Button>
          <Button type="button" onClick={startNewInterview}>
            <Plus className="h-4 w-4" />
            新しい面談を記録
          </Button>
        </div>

        {profileSummary && (
          <Card className="border-slate-200 bg-slate-50/80">
            <CardHeader className="pb-2">
              <CardTitle className="font-ja text-base">登録済みの基本情報（参照）</CardTitle>
              <CardDescription className="font-ja">
                {profileSummary.targetUniversities.length > 0 ? (
                  <>
                    志望:{" "}
                    {[...profileSummary.targetUniversities]
                      .sort((a, b) => a.priority - b.priority)
                      .map((u) => `${u.name} ${u.faculty}`)
                      .join(" / ")}
                  </>
                ) : (
                  "志望校が未登録です。"
                )}
                {profileSummary.commonTestYear ? ` ／ 共通テスト ${profileSummary.commonTestYear}年度` : ""}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {saved && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-ja text-sm text-green-800">
            <Check className="h-4 w-4" />
            面談を保存しました（第{records.length}回）。カルテの AI 分析に反映されます。
          </div>
        )}
        {error && <p className="font-ja text-sm text-red-600">{error}</p>}

        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="space-y-2">
            <h2 className="font-ja text-sm font-semibold text-slate-700">面談履歴（{records.length}回）</h2>
            {records.length === 0 ? (
              <p className="font-ja text-xs text-slate-500">まだ記録がありません</p>
            ) : (
              <ul className="-mx-1 flex gap-2 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0">
                {records.map((rec) => (
                  <li key={rec.id} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      className={`min-w-[9.5rem] rounded-lg border px-3 py-2 text-left font-ja text-sm transition-colors lg:min-w-0 lg:w-full ${
                        viewingRecordId === rec.id
                          ? "border-blue-300 bg-blue-50 text-blue-900"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                      onClick={() => openRecord(rec)}
                    >
                      <span className="font-medium">第{rec.recordNumber}回</span>
                      <br />
                      <span className="text-xs text-slate-500">{formatConductedAt(rec.conductedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {viewingRecordId === "new" && (
              <p className="font-ja text-xs text-blue-700">← 新規入力中</p>
            )}
          </aside>

          <SafeForm className="space-y-6" onSafeSubmit={handleSave}>
            {isReadOnly && (
              <Card className="border-slate-200 bg-slate-50">
                <CardDescription className="p-4 font-ja text-sm text-slate-600">
                  過去の面談を表示しています。内容を変える場合は「新しい面談を記録」から追加してください。
                </CardDescription>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="font-ja text-lg">生徒からの相談内容</CardTitle>
                <CardDescription className="font-ja">
                  生徒の言葉・不安・質問・申し送り（AI が「生徒の声」として参照）
                </CardDescription>
              </CardHeader>
              <Textarea
                className="min-h-28 font-ja"
                disabled={isReadOnly}
                placeholder="例: 第4問の英作文が時間内に書けない。志望は理三だが医学部も視野に入れたい。"
                value={studentConsultation}
                onChange={(e) => setStudentConsultation(e.target.value)}
              />
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-ja text-lg">教師が伝えたアドバイス</CardTitle>
                <CardDescription className="font-ja">
                  今回の面談で指示したこと・次回までの課題（AI が「指導方針」として参照）
                </CardDescription>
              </CardHeader>
              <Textarea
                className="min-h-28 font-ja"
                disabled={isReadOnly}
                placeholder="例: 構成は3段落固定。次回まで過去問第4問を2本。医学部は別途英作文量を増やす。"
                value={teacherAdvice}
                onChange={(e) => setTeacherAdvice(e.target.value)}
              />
            </Card>

            {!isReadOnly && (
              <div className="flex justify-end">
                <Button type="button" className="min-h-11 min-w-40 gap-2" disabled={saving} onClick={handleSave}>
                  <Save className="h-4 w-4" />
                  {saving ? "保存中..." : `第${records.length + 1}回の面談を保存`}
                </Button>
              </div>
            )}
          </SafeForm>
        </div>
      </div>
    </div>
  );
}
