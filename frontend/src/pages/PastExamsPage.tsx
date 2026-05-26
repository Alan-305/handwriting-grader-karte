import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Archive, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/firebase";
import type { University } from "@/types/past-exam";

const STARTER_UNIVERSITIES: Pick<University, "slug" | "name" | "nameEn">[] = [
  { slug: "todai", name: "東京大学", nameEn: "The University of Tokyo" },
];

export function PastExamsPage() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(getDb(), "universities"), orderBy("name"));
    return onSnapshot(
      q,
      (snap) => {
        setUniversities(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as University));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  const displayList =
    universities.length > 0
      ? universities
      : STARTER_UNIVERSITIES.map((u) => ({
          id: u.slug,
          slug: u.slug,
          name: u.name,
          nameEn: u.nameEn,
          status: "active" as const,
        }));

  return (
    <div>
      <PageHeader
        title="過去問コーパス"
        description="大学ごとの過去問を年度単位で追加・管理します。年度数に上限はなく、新しい入試が公開されるたびに取り込めます。"
      />
      <div className="page-content space-y-6">
        <Card className="border-blue-100 bg-blue-50/40">
          <CardHeader>
            <CardTitle className="font-ja text-base">柔軟な年度運用</CardTitle>
            <CardDescription className="font-ja leading-relaxed">
              「5年分」などの固定枠はありません。2026年、2027年…必要な年度だけを都度追加してください。
              問題・解答・リスニング脚本の PDF をアップロードすると、AI が大問単位に分解します。
            </CardDescription>
          </CardHeader>
        </Card>

        {loading ? (
          <p className="font-ja text-sm text-slate-500">読み込み中...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {displayList.map((uni) => (
              <Card key={uni.id} className="flex flex-col justify-between">
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-ja text-lg font-semibold text-slate-900">{uni.name}</h2>
                      {uni.nameEn && (
                        <p className="font-en mt-1 text-sm text-slate-500">{uni.nameEn}</p>
                      )}
                    </div>
                    <Archive className="h-5 w-5 shrink-0 text-blue-800" />
                  </div>
                  <p className="mt-3 font-ja text-sm text-slate-600">
                    登録済みの過去問年度を確認したり、新しい年度を取り込んだりできます。
                  </p>
                </div>
                <div className="flex border-t border-slate-100 p-4">
                  <Button asChild className="min-h-11 w-full gap-2">
                    <Link to={`/past-exams/${uni.slug}`}>
                      年度一覧を開く
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="flex justify-center pt-2">
          <Button asChild variant="outline" className="min-h-11 gap-2">
            <Link to="/past-exams/todai/import">
              <Plus className="h-4 w-4" />
              東京大学の新しい年度を取り込む
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
