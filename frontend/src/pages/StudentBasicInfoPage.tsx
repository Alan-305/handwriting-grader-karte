import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { ArrowLeft, Check, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { SafeForm } from "@/components/forms/SafeForm";
import {
  StudentProfileFields,
  emptyStudentProfile,
  profileFromStudent,
} from "@/components/students/StudentProfileFields";
import { Button } from "@/components/ui/button";
import { useStudents } from "@/hooks/useStudent";
import { getDb } from "@/lib/firebase";
import type { Student, StudentInterviewProfile } from "@/types/firestore";

export function StudentBasicInfoPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { updateStudent } = useStudents();
  const [student, setStudent] = useState<Student | null>(null);
  const [profile, setProfile] = useState(emptyStudentProfile());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!studentId) return;
    return onSnapshot(doc(getDb(), "students", studentId), (snap) => {
      if (!snap.exists()) return;
      const s = { id: snap.id, ...snap.data() } as Student;
      setStudent(s);
      setProfile(profileFromStudent(s.interviewProfile, s.targetUniversities));
    });
  }, [studentId]);

  const handleSave = async () => {
    if (!studentId) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const profilePayload: StudentInterviewProfile = {
        ...profile,
        updatedAt: serverTimestamp() as StudentInterviewProfile["updatedAt"],
      };
      await updateStudent(studentId, {
        targetUniversities: profile.targetUniversities,
        interviewProfile: profilePayload,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (!student) {
    return (
      <div>
        <PageHeader title="生徒基本情報" description="読み込み中..." />
        <p className="page-content font-ja text-slate-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`${student.name} — 基本情報`}
        description="志望校・共通テスト・確定事項。面談記録とは別に保存します"
      />
      <div className="page-content mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/students">
              <ArrowLeft className="h-4 w-4" />
              生徒一覧
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/students/${studentId}/dashboard`}>カルテ</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/students/${studentId}/interview`}>面談記録</Link>
          </Button>
        </div>

        {saved && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-ja text-sm text-green-800">
            <Check className="h-4 w-4" />
            基本情報を保存しました
          </div>
        )}
        {error && <p className="font-ja text-sm text-red-600">{error}</p>}

        <SafeForm className="space-y-6" onSafeSubmit={handleSave}>
          <StudentProfileFields profile={profile} onChange={setProfile} />
          <div className="flex justify-end">
            <Button type="button" className="min-h-11 min-w-40 gap-2" disabled={saving} onClick={handleSave}>
              <Save className="h-4 w-4" />
              {saving ? "保存中..." : "基本情報を保存"}
            </Button>
          </div>
        </SafeForm>
      </div>
    </div>
  );
}
