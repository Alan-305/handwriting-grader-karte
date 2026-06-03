import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, ChevronRight, Sparkles } from "lucide-react";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { getDb } from "@/lib/firebase";
import type { GenerationUnit } from "@/types/question-design";
import type { University } from "@/types/past-exam";

const PIPELINE_LABELS: Record<GenerationUnit["pipeline"], string> = {
  q1: "読解総合（問1〜5）",
  q2: "読解総合（問1〜6）",
  q1a: "英文要約",
  q1b: "空所補充",
  q2a: "自由英作文",
  q2b: "和文英訳",
  q4a: "誤り指摘",
  q4b: "下線部和訳",
  q5: "長文読解（第5問）",
  generic: "型別生成",
};

function unitGeneratePath(slug: string, unit: GenerationUnit): string | null {
  switch (unit.pipeline) {
    case "q1":
      return `/questions/generate/${slug}/q1`;
    case "q2":
      return `/questions/generate/${slug}/q2`;
    case "q1a":
      return "/questions/generate/q1a";
    case "q1b":
      return "/questions/generate/q1b";
    case "q2a":
      return "/questions/generate/q2a";
    case "q2b":
      return "/questions/generate/q2b";
    case "q4a":
      return "/questions/generate/q4a";
    case "q4b":
      return "/questions/generate/q4b";
    case "q5":
      return "/questions/generate/q5";
    default:
      return `/questions/generate?university=${encodeURIComponent(slug)}`;
  }
}

export function UniversityPastExamGeneratePage() {
  const { slug = "" } = useParams();
  const { getIdToken } = useAuth();

  const [university, setUniversity] = useState<University | null>(null);
  const [units, setUnits] = useState<GenerationUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUnits = useCallback(async () => {
    if (!slug) return;
    setError(null);
    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      setLoading(false);
      return;
    }
    try {
      const { generationUnits } = await apiClient.listGenerationUnits(token, slug);
      setUnits(generationUnits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成メニューの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, slug]);

  useEffect(() => {
    void loadUnits();
  }, [loadUnits]);

  useEffect(() => {
    if (!slug) return;
    return onSnapshot(doc(getDb(), "universities", slug), (snap) => {
      if (snap.exists()) {
        setUniversity({ id: snap.id, ...snap.data() } as University);
      } else {
        setUniversity({ id: slug, slug, name: slug, status: "active" });
      }
    });
  }, [slug]);

  const displayName = university?.name ?? slug;

  const summary = useMemo(() => {
    if (loading) return "読み込み中...";
    if (units.length === 0) return "この大学で生成できる大問はまだ登録されていません";
    return `${units.length} 種類の生成メニュー`;
  }, [loading, units.length]);

  return (
    <div>
      <PageHeader title={`${displayName} — 問題生成`} description={summary} />
      <div className="page-content space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" className="min-h-11 gap-2">
            <Link to={`/past-exams/${slug}`}>
              <ArrowLeft className="h-4 w-4" />
              過去問へ
            </Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11 font-ja text-sm">
            <Link to="/question-drafts">下書き一覧</Link>
          </Button>
        </div>

        <Card className="border-blue-100 bg-blue-50/40">
          <CardHeader>
            <CardTitle className="font-ja text-base">大学別の問題生成</CardTitle>
            <CardDescription className="font-ja leading-relaxed">
              {displayName}の過去問コーパスに基づき、利用可能な大問だけが表示されます。左メニューの「過去問」から大学を選び、この画面で問題を生成します。
            </CardDescription>
          </CardHeader>
        </Card>

        {loading ? (
          <InlineLoading message="生成メニューを読み込み中..." />
        ) : error ? (
          <Card className="border-red-200 bg-red-50 p-6">
            <p className="font-ja text-sm text-red-800">{error}</p>
            <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={() => loadUnits()}>
              再読み込み
            </Button>
          </Card>
        ) : units.length === 0 ? (
          <Card className="p-8 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-4 font-ja text-slate-600">
              過去問を取り込むと、ここに生成メニューが表示されます。
            </p>
            <Button asChild className="mt-6 min-h-11">
              <Link to={`/past-exams/${slug}/import`}>過去問を取り込む</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {units.map((unit) => {
              const path = unitGeneratePath(slug, unit);
              const yearsLabel =
                unit.years.length > 0 ? `${unit.years.slice(0, 3).join("・")}年度 等` : "参照年度なし";
              return (
                <Card key={unit.unitKey} className="flex flex-col justify-between">
                  <div className="p-6">
                    <h2 className="font-ja text-lg font-semibold text-slate-900">{unit.typeLabel}</h2>
                    <p className="mt-2 font-ja text-sm text-slate-600">
                      {PIPELINE_LABELS[unit.pipeline] ?? unit.pipeline}
                    </p>
                    <p className="mt-1 font-ja text-xs text-slate-500">参照: {yearsLabel}</p>
                  </div>
                  {path && (
                    <div className="border-t border-slate-100 p-4">
                      <Button asChild className="min-h-11 w-full gap-2">
                        <Link to={path}>
                          生成画面を開く
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
