import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { ArrowLeft, Check, Plus, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { SafeForm } from "@/components/forms/SafeForm";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useStudents } from "@/hooks/useStudent";
import { useInterviewRecords } from "@/hooks/useSession";
import { getDb } from "@/lib/firebase";
import {
  COMMON_TEST_SCORE_OPTIONS,
  COMMON_TEST_SUBJECTS,
  COMMON_TEST_YEAR_OPTIONS,
  CONFIRMED_FACT_OPTIONS,
  COURSE_OPTIONS,
} from "@/constants/student-interview";
import type {
  Student,
  StudentInterviewProfile,
  StudentInterviewRecord,
  TargetUniversity,
  TargetUniversityRef,
} from "@/types/firestore";

const selectClass =
  "mt-1 flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-ja text-sm text-slate-900";

function emptyProfile(): StudentInterviewProfile {
  return {
    targetUniversities: [],
    commonTestScores: {},
    confirmedFactIds: [],
  };
}

function profileFromSources(
  student: Student,
  latestRecord: StudentInterviewRecord | null,
): StudentInterviewProfile {
  if (latestRecord) {
    return {
      targetUniversities: latestRecord.targetUniversities,
      commonTestYear: latestRecord.commonTestYear,
      commonTestScores: latestRecord.commonTestScores ?? {},
      confirmedFactIds: latestRecord.confirmedFactIds ?? [],
    };
  }
  if (student.interviewProfile) {
    return {
      ...emptyProfile(),
      ...student.interviewProfile,
      targetUniversities:
        student.interviewProfile.targetUniversities ?? student.targetUniversities ?? [],
    };
  }
  return {
    ...emptyProfile(),
    targetUniversities: student.targetUniversities ?? [],
  };
}

function formatConductedAt(ts: Timestamp | undefined): string {
  if (!ts?.toDate) return "日時未設定";
  const d = ts.toDate();
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function StudentInterviewPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { updateStudent } = useStudents();
  const [student, setStudent] = useState<Student | null>(null);
  const [universities, setUniversities] = useState<TargetUniversity[]>([]);
  const [course, setCourse] = useState("医学部受験コース");
  const [profile, setProfile] = useState<StudentInterviewProfile>(emptyProfile());
  const [studentConsultation, setStudentConsultation] = useState("");
  const [teacherAdvice, setTeacherAdvice] = useState("");
  const [viewingRecordId, setViewingRecordId] = useState<string | "new">("new");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [addUniId, setAddUniId] = useState("");
  const records = useInterviewRecords(studentId);

  useEffect(() => {
    if (!studentId) return;
    return onSnapshot(doc(getDb(), "students", studentId), (snap) => {
      if (!snap.exists()) return;
      setStudent({ id: snap.id, ...snap.data() } as Student);
    });
  }, [studentId]);

  useEffect(() => {
    const q = query(collection(getDb(), "target_universities"), orderBy("name"));
    return onSnapshot(q, (snap) => {
      setUniversities(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TargetUniversity));
    });
  }, []);

  const latestRecord = records[0] ?? null;

  useEffect(() => {
    if (!student) return;
    setCourse(student.course || COURSE_OPTIONS[0]);
  }, [student]);

  useEffect(() => {
    if (!student || viewingRecordId !== "new") return;
    setProfile(profileFromSources(student, latestRecord));
  }, [student, latestRecord, viewingRecordId]);

  const openRecord = useCallback((rec: StudentInterviewRecord) => {
    setViewingRecordId(rec.id);
    setProfile({
      targetUniversities: rec.targetUniversities,
      commonTestYear: rec.commonTestYear,
      commonTestScores: rec.commonTestScores ?? {},
      confirmedFactIds: rec.confirmedFactIds ?? [],
    });
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
    if (!student) return;
    setViewingRecordId("new");
    setProfile(profileFromSources(student, latestRecord));
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

  const uniOptions = useMemo(() => {
    const used = new Set(profile.targetUniversities.map((u) => u.universityId));
    return universities.filter((u) => !used.has(u.id));
  }, [universities, profile.targetUniversities]);

  const isReadOnly = viewingRecordId !== "new";

  const addTargetUniversity = () => {
    if (!addUniId || isReadOnly) return;
    const u = universities.find((x) => x.id === addUniId);
    if (!u) return;
    const ref: TargetUniversityRef = {
      universityId: u.id,
      name: u.name,
      faculty: u.faculty,
      priority: profile.targetUniversities.length + 1,
    };
    setProfile((p) => ({ ...p, targetUniversities: [...p.targetUniversities, ref] }));
    setAddUniId("");
  };

  const removeTargetUniversity = (universityId: string) => {
    if (isReadOnly) return;
    setProfile((p) => ({
      ...p,
      targetUniversities: p.targetUniversities
        .filter((u) => u.universityId !== universityId)
        .map((u, i) => ({ ...u, priority: i + 1 })),
    }));
  };

  const movePriority = (universityId: string, dir: -1 | 1) => {
    if (isReadOnly) return;
    const list = [...profile.targetUniversities].sort((a, b) => a.priority - b.priority);
    const idx = list.findIndex((u) => u.universityId === universityId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= list.length) return;
    [list[idx], list[swap]] = [list[swap], list[idx]];
    setProfile((p) => ({
      ...p,
      targetUniversities: list.map((u, i) => ({ ...u, priority: i + 1 })),
    }));
  };

  const toggleFact = (id: string) => {
    if (isReadOnly) return;
    setProfile((p) => ({
      ...p,
      confirmedFactIds: p.confirmedFactIds.includes(id)
        ? p.confirmedFactIds.filter((x) => x !== id)
        : [...p.confirmedFactIds, id],
    }));
  };

  const handleSave = async () => {
    if (!studentId || isReadOnly) return;
    if (!studentConsultation.trim() && !teacherAdvice.trim()) {
      setError("生徒の相談内容または教師のアドバイスのどちらかを入力してください");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const recordNumber = records.length + 1;
      const recordPayload = {
        conductedAt: serverTimestamp(),
        recordNumber,
        studentConsultation: studentConsultation.trim(),
        teacherAdvice: teacherAdvice.trim(),
        targetUniversities: profile.targetUniversities,
        commonTestYear: profile.commonTestYear,
        commonTestScores: profile.commonTestScores,
        confirmedFactIds: profile.confirmedFactIds,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(getDb(), "students", studentId, "interview_records"), recordPayload);

      const profilePayload: StudentInterviewProfile = {
        ...profile,
        updatedAt: serverTimestamp() as StudentInterviewProfile["updatedAt"],
      };
      await updateStudent(studentId, {
        course,
        targetUniversities: profile.targetUniversities,
        interviewProfile: profilePayload,
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
        description="テスト返却のたびに1回ずつ記録。相談内容と教師アドバイスは AI 分析に蓄積されます"
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
            <Link to="/universities">志望校マスタ（プルダウン用）</Link>
          </Button>
          <Button type="button" onClick={startNewInterview}>
            <Plus className="h-4 w-4" />
            新しい面談を記録
          </Button>
        </div>

        <Card className="border-blue-100 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-ja text-base text-blue-900">
              志望校プルダウンに出る選択肢について
            </CardTitle>
            <CardDescription className="font-ja leading-relaxed text-blue-800">
              面談画面のプルダウンは、サイドメニュー「
              <Link to="/universities" className="font-semibold underline">
                志望校
              </Link>
              」で登録した大学・学部だけが表示されます（現在 {universities.length} 件）。
              東大理三・医学部などを選べるようにするには、志望校マスタで「大学名」と「学部」を分けて追加するか、「よく使う志望校を一括登録」を押してください。
            </CardDescription>
          </CardHeader>
        </Card>

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

            <Card>
              <CardHeader>
                <CardTitle className="font-ja text-lg">受講コース</CardTitle>
              </CardHeader>
              <select
                className={selectClass}
                disabled={isReadOnly}
                value={course}
                onChange={(e) => setCourse(e.target.value)}
              >
                {COURSE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-ja text-lg">志望校・学部</CardTitle>
                <CardDescription className="font-ja">
                  志望校マスタから選択。変更した場合はこの回の記録として保存されます。
                </CardDescription>
              </CardHeader>
              <div className="space-y-3">
                {profile.targetUniversities.length === 0 ? (
                  <p className="font-ja text-sm text-slate-500">志望校が未登録です。</p>
                ) : (
                  <ul className="space-y-2">
                    {[...profile.targetUniversities]
                      .sort((a, b) => a.priority - b.priority)
                      .map((u) => (
                        <li
                          key={u.universityId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          <div>
                            <span className="font-ja text-xs text-slate-500">第{u.priority}志望</span>
                            <p className="font-ja font-medium">
                              {u.name} {u.faculty}
                            </p>
                          </div>
                          {!isReadOnly && (
                            <div className="flex gap-1">
                              <Button type="button" variant="outline" size="sm" onClick={() => movePriority(u.universityId, -1)}>
                                ↑
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => movePriority(u.universityId, 1)}>
                                ↓
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeTargetUniversity(u.universityId)}>
                                削除
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                  </ul>
                )}
                {!isReadOnly && (
                  <div className="flex flex-wrap gap-2">
                    <select className={`${selectClass} max-w-md flex-1`} value={addUniId} onChange={(e) => setAddUniId(e.target.value)}>
                      <option value="">志望校を選択...</option>
                      {uniOptions.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} — {u.faculty}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="default" disabled={!addUniId} onClick={addTargetUniversity}>
                      <Plus className="h-4 w-4" />
                      追加
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-ja text-lg">大学入学共通テスト</CardTitle>
              </CardHeader>
              <div className="mb-4">
                <label className="font-ja text-sm text-slate-600">受験年度</label>
                <select
                  className={`${selectClass} max-w-xs`}
                  disabled={isReadOnly}
                  value={profile.commonTestYear ? String(profile.commonTestYear) : ""}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      commonTestYear: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                >
                  <option value="">未選択</option>
                  {COMMON_TEST_YEAR_OPTIONS().map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {COMMON_TEST_SUBJECTS.map((sub) => (
                  <div key={sub.id}>
                    <label className="font-ja text-sm text-slate-600">{sub.label}</label>
                    <select
                      className={selectClass}
                      disabled={isReadOnly}
                      value={profile.commonTestScores[sub.id] ?? ""}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          commonTestScores: { ...p.commonTestScores, [sub.id]: e.target.value },
                        }))
                      }
                    >
                      {COMMON_TEST_SCORE_OPTIONS.map((o) => (
                        <option key={o.value || "empty"} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-ja text-lg">面談で確定した事項</CardTitle>
              </CardHeader>
              <ul className="space-y-2">
                {CONFIRMED_FACT_OPTIONS.map((opt) => (
                  <li key={opt.id}>
                    <label
                      className={`flex min-h-11 items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 ${isReadOnly ? "opacity-80" : "cursor-pointer hover:bg-slate-50"}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        disabled={isReadOnly}
                        checked={profile.confirmedFactIds.includes(opt.id)}
                        onChange={() => toggleFact(opt.id)}
                      />
                      <span className="font-ja text-sm">{opt.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
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
