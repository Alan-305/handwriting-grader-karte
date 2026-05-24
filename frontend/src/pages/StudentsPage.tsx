import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Plus, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { SafeForm } from "@/components/forms/SafeForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useStudents } from "@/hooks/useStudent";

export function StudentsPage() {
  const { students, loading, createStudent, removeStudent } = useStudents();
  const [name, setName] = useState("");
  const [course, setCourse] = useState("医学部受験コース");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim()) {
      setError("氏名を入力してください");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await createStudent({ name: name.trim(), course, targetUniversities: [] });
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

  return (
    <div>
      <PageHeader title="生徒管理" description="生徒を追加したら「保存」を押してください" />
      <div className="space-y-6 p-8">
        {saved && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-ja text-sm text-green-800">
            <Check className="h-4 w-4" />
            生徒を保存しました
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
              <div className="grid gap-4 md:grid-cols-2">
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
                <div className="space-y-1">
                  <label className="font-ja text-sm text-slate-600">コース</label>
                  <Input value={course} onChange={(e) => setCourse(e.target.value)} />
                </div>
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
            {students.map((s) => (
              <Card key={s.id} className="flex flex-col justify-between">
                <div>
                  <h3 className="font-ja text-lg font-semibold">{s.name}</h3>
                  <p className="font-ja text-sm text-slate-500">{s.course}</p>
                  {s.targetUniversities?.length > 0 && (
                    <p className="mt-2 font-ja text-xs text-slate-400">
                      志望: {s.targetUniversities.map((u) => u.name).join("、")}
                    </p>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/students/${s.id}/dashboard`}>カルテ</Link>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeStudent(s.id)}>
                    削除
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
