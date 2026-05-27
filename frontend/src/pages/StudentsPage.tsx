import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Plus, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { SafeForm } from "@/components/forms/SafeForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useStudents } from "@/hooks/useStudent";
import { StudentHistoryModal } from "@/components/students/StudentHistoryModal";
import { profileFromStudent } from "@/components/students/StudentProfileFields";
import type { Student } from "@/types/firestore";

const studentActionBtn =
  "min-h-11 w-full flex-1 border font-ja text-xs shadow-none hover:opacity-90 sm:text-sm";

const studentActionStyles = {
  karte: `${studentActionBtn} border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100`,
  profile: `${studentActionBtn} border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`,
  interview: `${studentActionBtn} border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100`,
  history: `${studentActionBtn} border-amber-200 bg-amber-50 text-amber-950 hover:bg-amber-100`,
} as const;

function targetSummary(s: Student) {
  const refs = profileFromStudent(s.interviewProfile, s.targetUniversities).targetUniversities;
  if (!refs.length) return null;
  return refs
    .sort((a, b) => a.priority - b.priority)
    .map((u) => `${u.name} ${u.faculty}`)
    .join(" / ");
}

export function StudentsPage() {
  const { students, loading, createStudent, removeStudent } = useStudents();
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [historyStudent, setHistoryStudent] = useState<{ id: string; name: string } | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("氏名を入力してください");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await createStudent({ name: name.trim(), course: "", targetUniversities: [] });
      setName("");
      setSaved(true);
      setShowForm(false);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveStudent = async (student: Student) => {
    const ok = window.confirm(
      `「${student.name}」を削除しますか？\n\nカルテ・基本情報・面談記録・添削履歴との紐付けが失われます。この操作は取り消せません。`,
    );
    if (!ok) return;
    try {
      await removeStudent(student.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  return (
    <div>
      <PageHeader title="生徒管理" description="生徒を追加したら「保存」を押してください" />
      <div className="page-content space-y-6">
        {saved && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-ja text-sm text-green-800">
            <Check className="h-4 w-4" />
            生徒を保存しました
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-ja text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            生徒を追加
          </Button>
        </div>

        {showForm && (
          <Card>
            <SafeForm className="space-y-4" onSafeSubmit={handleSave}>
              <div className="space-y-1">
                <label className="font-ja text-sm text-slate-600">氏名</label>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError("");
                  }}
                  placeholder="例: 山田 太郎"
                />
              </div>
              {error && <p className="font-ja text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  キャンセル
                </Button>
                <Button type="button" className="min-w-28 gap-2" disabled={saving} onClick={handleSave}>
                  <Save className="h-4 w-4" />
                  {saving ? "保存中..." : "保存"}
                </Button>
              </div>
            </SafeForm>
          </Card>
        )}

        {loading ? (
          <p className="font-ja text-slate-500">読み込み中...</p>
        ) : students.length === 0 ? (
          <Card className="text-center font-ja text-slate-500">
            生徒が登録されていません。「生徒を追加」から登録してください。
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {students.map((s) => {
              const targets = targetSummary(s);
              return (
                <Card key={s.id} className="flex flex-col justify-between">
                  <div>
                    <h3 className="font-ja text-lg font-semibold">{s.name}</h3>
                    {targets ? (
                      <p className="mt-2 font-ja text-xs text-slate-600">志望: {targets}</p>
                    ) : (
                      <p className="mt-2 font-ja text-xs text-slate-400">基本情報未登録</p>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button asChild variant="outline" size="sm" className={studentActionStyles.karte}>
                      <Link to={`/students/${s.id}/dashboard`}>カルテ</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className={studentActionStyles.profile}>
                      <Link to={`/students/${s.id}/profile`}>基本情報</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className={studentActionStyles.interview}>
                      <Link to={`/students/${s.id}/interview`}>面談</Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={studentActionStyles.history}
                      onClick={() => setHistoryStudent({ id: s.id, name: s.name })}
                    >
                      過去の結果
                    </Button>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-10 font-ja text-slate-500 hover:text-red-700"
                      onClick={() => void handleRemoveStudent(s)}
                    >
                      削除
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      {historyStudent && (
        <StudentHistoryModal
          open
          studentId={historyStudent.id}
          studentName={historyStudent.name}
          onClose={() => setHistoryStudent(null)}
        />
      )}
    </div>
  );
}
