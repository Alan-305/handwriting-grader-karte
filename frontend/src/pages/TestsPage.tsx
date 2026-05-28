import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";
import { Archive, Plus } from "lucide-react";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { getDb } from "@/lib/firebase";
import type { Test } from "@/types/firestore";

function sortTests(rows: Test[]) {
  return [...rows].sort((a, b) => {
    const aTime = a.updatedAt?.toMillis?.() ?? 0;
    const bTime = b.updatedAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });
}

export function TestsPage() {
  const { user } = useAuth();
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(getDb(), "tests"), where("teacherId", "==", user.uid));
    return onSnapshot(
      q,
      (snap) => {
        setTests(sortTests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Test)));
        setLoading(false);
        setLoadError(null);
      },
      (err) => {
        setLoadError(err.message || "問題セットの読み込みに失敗しました");
        setLoading(false);
      },
    );
  }, [user]);

  const createTest = async () => {
    if (!user) return;
    const ref = await addDoc(collection(getDb(), "tests"), {
      teacherId: user.uid,
      title: "新しいテスト",
      templateId: "",
      totalPoints: 0,
      questionCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    window.location.href = `/tests/${ref.id}`;
  };

  return (
    <div>
      <PageHeader
        title="問題セット"
        description="手書き添削用のテスト問題・模範解答・配点を管理します（大学過去問とは別のメニューです）"
      />
      <div className="page-content space-y-6">
        <Card className="border-blue-100 bg-blue-50/40">
          <CardHeader>
            <CardTitle className="font-ja text-base">過去問との違い</CardTitle>
            <CardDescription className="space-y-2 font-ja leading-relaxed">
              <p>
                <strong>過去問</strong>（左メニュー「過去問」）… 東大2026など、PDF から取り込んだ入試過去問コーパス
              </p>
              <p>
                <strong>問題セット</strong>（この画面）… プレサポ問題など、答案用紙に紐付けて<strong>添削する</strong>
                ためのテスト
              </p>
            </CardDescription>
            <Button asChild variant="outline" size="sm" className="mt-2 min-h-11 gap-2">
              <Link to="/past-exams/todai/years/2026">
                <Archive className="h-4 w-4" />
                2026年度の過去問を見る
              </Link>
            </Button>
          </CardHeader>
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Button asChild variant="outline" className="min-h-11 gap-2">
            <Link to="/question-drafts">下書き一覧</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 gap-2">
            <Link to="/questions/generate">問題・模範解答を生成</Link>
          </Button>
          <Button onClick={createTest} className="min-h-11 gap-2">
            <Plus className="h-4 w-4" />
            新規テスト
          </Button>
        </div>

        {loading ? (
          <InlineLoading message="問題セットを読み込み中..." />
        ) : loadError ? (
          <Card className="border-red-200 bg-red-50 p-6">
            <p className="font-ja text-sm text-red-800">{loadError}</p>
          </Card>
        ) : tests.length === 0 ? (
          <Card className="p-8 text-center font-ja text-slate-600">
            <p>まだ問題セットがありません。</p>
            <p className="mt-2 text-sm text-slate-500">
              「新規テスト」からプレサポ問題などを登録してください。過去問は「過去問」メニューで確認できます。
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tests.map((t) => (
              <Card key={t.id} className="p-6">
                <h3 className="font-ja text-lg font-semibold">{t.title}</h3>
                <p className="font-ja text-sm text-slate-500">
                  {t.questionCount}問 / {t.totalPoints}点満点
                </p>
                <Button asChild variant="outline" size="sm" className="mt-4 min-h-11">
                  <Link to={`/tests/${t.id}`}>編集</Link>
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
