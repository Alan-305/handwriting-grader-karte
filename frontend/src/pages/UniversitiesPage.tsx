import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { Check, Plus, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { SafeForm } from "@/components/forms/SafeForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { getDb } from "@/lib/firebase";
import type { AnswerSheetTemplate, TargetUniversity } from "@/types/firestore";

const A4_PRESET = { name: "A4標準", pageWidth: 2480, pageHeight: 3508 };

export function UniversitiesPage() {
  const { user } = useAuth();
  const [universities, setUniversities] = useState<TargetUniversity[]>([]);
  const [templates, setTemplates] = useState<AnswerSheetTemplate[]>([]);
  const [showUniForm, setShowUniForm] = useState(false);
  const [showTplForm, setShowTplForm] = useState(false);
  const [tplSaved, setTplSaved] = useState(false);
  const [uniForm, setUniForm] = useState({
    name: "",
    faculty: "",
    difficultyLevel: 3 as 1 | 2 | 3 | 4 | 5,
    examTrends: "",
  });
  const [tplForm, setTplForm] = useState(A4_PRESET);

  useEffect(() => {
    const q = query(collection(getDb(), "target_universities"), orderBy("name"));
    return onSnapshot(q, (snap) => {
      setUniversities(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TargetUniversity));
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(getDb(), "answer_sheet_templates"),
      where("teacherId", "==", user.uid),
    );
    return onSnapshot(q, (snap) => {
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AnswerSheetTemplate));
    });
  }, [user]);

  const addUniversity = async () => {
    await addDoc(collection(getDb(), "target_universities"), {
      ...uniForm,
      updatedAt: serverTimestamp(),
    });
    setUniForm({ name: "", faculty: "", difficultyLevel: 3, examTrends: "" });
    setShowUniForm(false);
  };

  const addTemplate = async () => {
    if (!user || !tplForm.name.trim()) return;
    await addDoc(collection(getDb(), "answer_sheet_templates"), {
      teacherId: user.uid,
      name: tplForm.name.trim(),
      pageWidth: tplForm.pageWidth,
      pageHeight: tplForm.pageHeight,
      alignmentMarks: [
        { corner: "tl", x: 0, y: 0 },
        { corner: "tr", x: tplForm.pageWidth - 1, y: 0 },
        { corner: "br", x: tplForm.pageWidth - 1, y: tplForm.pageHeight - 1 },
        { corner: "bl", x: 0, y: tplForm.pageHeight - 1 },
      ],
      createdAt: serverTimestamp(),
    });
    setTplForm(A4_PRESET);
    setShowTplForm(false);
    setTplSaved(true);
    setTimeout(() => setTplSaved(false), 4000);
  };

  return (
    <div>
      <PageHeader
        title="志望校・テンプレート"
        description="志望校情報と、答案用紙のサイズ設定（テンプレート）を管理します"
      />
      <div className="space-y-8 p-8">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-ja text-xl font-semibold">志望校マスタ</h2>
            <Button onClick={() => setShowUniForm(!showUniForm)}>
              <Plus className="h-4 w-4" />
              追加
            </Button>
          </div>
          {showUniForm && (
            <Card>
              <SafeForm className="grid gap-4 md:grid-cols-2" onSafeSubmit={addUniversity}>
                <Input placeholder="大学名" value={uniForm.name} onChange={(e) => setUniForm({ ...uniForm, name: e.target.value })} />
                <Input placeholder="学部" value={uniForm.faculty} onChange={(e) => setUniForm({ ...uniForm, faculty: e.target.value })} />
                <Input type="number" min={1} max={5} placeholder="難易度" value={uniForm.difficultyLevel} onChange={(e) => setUniForm({ ...uniForm, difficultyLevel: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })} />
                <Textarea placeholder="出題傾向" value={uniForm.examTrends} onChange={(e) => setUniForm({ ...uniForm, examTrends: e.target.value })} />
                <Button type="button" className="gap-2" onClick={addUniversity}>
                  保存
                </Button>
              </SafeForm>
            </Card>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {universities.map((u) => (
              <Card key={u.id}>
                <h3 className="font-ja font-semibold">{u.name} {u.faculty}</h3>
                <p className="font-ja text-sm text-slate-500">難易度: {u.difficultyLevel}</p>
                <p className="mt-2 font-ja text-sm text-slate-600">{u.examTrends}</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => deleteDoc(doc(getDb(), "target_universities", u.id))}>
                  削除
                </Button>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-ja text-xl font-semibold">解答用紙テンプレート</h2>
            <Button onClick={() => setShowTplForm(!showTplForm)}>
              <Plus className="h-4 w-4" />
              テンプレートを作成
            </Button>
          </div>

          <Card className="border-blue-100 bg-blue-50/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-ja">解答用紙テンプレートとは？</CardTitle>
              <CardDescription className="font-ja leading-relaxed">
                生徒が手書きで答える「答案用紙」のサイズと、四隅のトンボ（位置合わせマーク）の設定です。
                スキャンした答案画像を正しい位置に合わせて、設問ごとに切り出すために使います。
                <br />
                <strong>最初は A4 標準のままで問題ありません。</strong>
              </CardDescription>
            </CardHeader>
            <ol className="list-decimal space-y-1 px-6 pb-4 font-ja text-sm text-slate-700">
              <li>下の「テンプレートを作成」をクリック</li>
              <li>名前を入力（例: A4標準）— そのままでも OK</li>
              <li>幅・高さは変更不要（A4 300dpi 相当）</li>
              <li>「保存」をクリック</li>
              <li>
                <Link to="/tests" className="text-blue-800 underline">
                  問題
                </Link>
                エディタで、このテンプレートをテストに紐付ける
              </li>
            </ol>
          </Card>

          {tplSaved && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-ja text-sm text-green-800">
              <Check className="h-4 w-4" />
              テンプレートを保存しました。次は
              <Link to="/tests" className="font-semibold underline">
                問題エディタ
              </Link>
              でテストに紐付けてください。
            </div>
          )}

          {showTplForm && (
            <Card className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTplForm(A4_PRESET)}
                >
                  A4 標準をセット（おすすめ）
                </Button>
              </div>
              <SafeForm className="grid gap-4 md:grid-cols-2" onSafeSubmit={addTemplate}>
                <div className="space-y-1">
                  <label className="font-ja text-sm text-slate-600">テンプレート名</label>
                  <Input
                    value={tplForm.name}
                    onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
                    placeholder="例: A4標準"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-ja text-sm text-slate-600">用紙の幅（px）</label>
                  <Input
                    type="number"
                    value={tplForm.pageWidth}
                    onChange={(e) => setTplForm({ ...tplForm, pageWidth: Number(e.target.value) })}
                  />
                  <p className="font-ja text-xs text-slate-400">A4 の場合: 2480</p>
                </div>
                <div className="space-y-1">
                  <label className="font-ja text-sm text-slate-600">用紙の高さ（px）</label>
                  <Input
                    type="number"
                    value={tplForm.pageHeight}
                    onChange={(e) => setTplForm({ ...tplForm, pageHeight: Number(e.target.value) })}
                  />
                  <p className="font-ja text-xs text-slate-400">A4 の場合: 3508</p>
                </div>
                <div className="flex items-end">
                  <Button type="button" className="gap-2" onClick={addTemplate}>
                    <Save className="h-4 w-4" />
                    保存
                  </Button>
                </div>
              </SafeForm>
            </Card>
          )}

          {templates.length === 0 ? (
            <Card className="text-center font-ja text-slate-500">
              テンプレートがありません。「テンプレートを作成」から追加してください。
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {templates.map((t) => (
                <Card key={t.id}>
                  <h3 className="font-ja font-semibold">{t.name}</h3>
                  <p className="font-ja text-sm text-slate-500">
                    {t.pageWidth} × {t.pageHeight}px（四隅トンボ自動設定）
                  </p>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
