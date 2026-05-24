import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { getDb } from "@/lib/firebase";
import type { Test } from "@/types/firestore";

export function TestsPage() {
  const { user } = useAuth();
  const [tests, setTests] = useState<Test[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(getDb(), "tests"),
      where("teacherId", "==", user.uid),
      orderBy("updatedAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setTests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Test));
    });
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
      <PageHeader title="問題セット" description="テスト問題・模範解答・配点を管理します" />
      <div className="space-y-6 p-8">
        <div className="flex justify-end">
          <Button onClick={createTest}>
            <Plus className="h-4 w-4" />
            新規テスト
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tests.map((t) => (
            <Card key={t.id}>
              <h3 className="font-ja text-lg font-semibold">{t.title}</h3>
              <p className="font-ja text-sm text-slate-500">
                {t.questionCount}問 / {t.totalPoints}点満点
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link to={`/tests/${t.id}`}>編集</Link>
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
