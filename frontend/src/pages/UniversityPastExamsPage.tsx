import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { getDb } from "@/lib/firebase";
import type { ExamYearSummary } from "@/types/api";
import type { University } from "@/types/past-exam";

const UNIVERSITY_NAMES: Record<string, string> = {
  todai: "東京大学",
};

function statusLabel(status?: string) {
  if (status === "approved") return { text: "承認済み", className: "bg-green-100 text-green-800" };
  return { text: "ドラフト", className: "bg-amber-100 text-amber-800" };
}

export function UniversityPastExamsPage() {
  const { slug = "" } = useParams();
  const location = useLocation();
  const { getIdToken } = useAuth();
  const savedYear = (location.state as { savedYear?: number } | null)?.savedYear;

  const [university, setUniversity] = useState<University | null>(null);
  const [examYears, setExamYears] = useState<ExamYearSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<number | null>(savedYear ?? null);

  const loadExamYears = useCallback(async () => {
    setLoadError(null);
    const token = await getIdToken();
    if (!token) {
      setLoadError("ログインが必要です");
      setLoading(false);
      return;
    }
    try {
      const { examYears: rows } = await apiClient.listExamYears(token, slug);
      setExamYears(rows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "年度一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, slug]);

  useEffect(() => {
    if (!slug) return;
    void loadExamYears();
  }, [slug, loadExamYears]);

  useEffect(() => {
    if (!savedYear) return;
    setSavedNotice(savedYear);
    const timer = setTimeout(() => setSavedNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [savedYear]);

  useEffect(() => {
    if (!slug) return;
    return onSnapshot(
      doc(getDb(), "universities", slug),
      (snap) => {
        if (snap.exists()) {
          setUniversity({ id: snap.id, ...snap.data() } as University);
        } else {
          setUniversity({
            id: slug,
            slug,
            name: UNIVERSITY_NAMES[slug] ?? slug,
            status: "active",
          });
        }
      },
      () => {
        setUniversity({
          id: slug,
          slug,
          name: UNIVERSITY_NAMES[slug] ?? slug,
          status: "active",
        });
      },
    );
  }, [slug]);

  const displayName = university?.name ?? UNIVERSITY_NAMES[slug] ?? slug;

  const summary = useMemo(() => {
    if (loading) return "読み込み中...";
    if (examYears.length === 0) return "まだ年度が登録されていません";
    const years = examYears.map((y) => y.year).join("、");
    return `${examYears.length} 年度分（${years}）`;
  }, [examYears, loading]);

  return (
    <div>
      <PageHeader title={`${displayName} — 過去問`} description={summary} />
      <div className="page-content space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" className="min-h-11 gap-2">
            <Link to="/past-exams">
              <ArrowLeft className="h-4 w-4" />
              大学一覧へ
            </Link>
          </Button>
          <Button asChild className="min-h-11 gap-2">
            <Link to={`/past-exams/${slug}/import`}>
              <Plus className="h-4 w-4" />
              新しい年度を取り込む
            </Link>
          </Button>
        </div>

        {savedNotice && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-ja text-sm text-green-800">
            {savedNotice} 年度を保存しました。下の一覧に表示されます。
          </div>
        )}

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-ja text-base">年度一覧</CardTitle>
            <CardDescription className="font-ja">
              登録されている年度だけが表示されます。古い年度も新しい年度も、必要に応じて追加してください。
            </CardDescription>
          </CardHeader>
        </Card>

        {loading ? (
          <InlineLoading message="年度一覧を読み込み中..." />
        ) : loadError ? (
          <Card className="border-red-200 bg-red-50 p-6">
            <p className="font-ja text-sm text-red-800">{loadError}</p>
            <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={() => loadExamYears()}>
              再読み込み
            </Button>
          </Card>
        ) : examYears.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-4 font-ja text-slate-600">この大学の過去問はまだありません。</p>
            <Button asChild className="mt-6 min-h-11">
              <Link to={`/past-exams/${slug}/import`}>最初の年度を取り込む</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {examYears.map((examYear) => {
              const badge = statusLabel(examYear.importStatus);
              return (
                <Card key={examYear.id} className="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-ja text-xl font-semibold">{examYear.year} 年度</h3>
                        <span className={`rounded-full px-3 py-1 font-ja text-xs font-medium ${badge.className}`}>
                          {badge.text}
                        </span>
                      </div>
                      <p className="mt-2 font-ja text-sm text-slate-600">
                        大問 {examYear.questionCount ?? "—"} 件
                        {examYear.listeningScriptCount
                          ? ` · リスニング脚本 ${examYear.listeningScriptCount} 件`
                          : ""}
                      </p>
                    </div>
                    <Button asChild variant="outline" className="min-h-11">
                      <Link to={`/past-exams/${slug}/years/${examYear.year}`}>詳細を見る</Link>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
