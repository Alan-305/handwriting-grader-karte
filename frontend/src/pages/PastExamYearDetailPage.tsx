import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { usePastExamUniversities } from "@/hooks/usePastExamUniversities";
import { apiClient } from "@/lib/api-client";
import { ANSWER_FORMAT_LABELS, resolveAnswerFormat } from "@/lib/past-exam-answer-format";
import { QuestionPromptBlock } from "@/lib/question-text-format";
import { TeacherExamMaterialsPanel } from "@/components/past-exams/TeacherExamMaterialsPanel";
import type { ExamYearSummary, PastQuestionSummary } from "@/types/api";
import type { AnswerFormat } from "@/types/past-exam";

const UNIVERSITY_NAMES: Record<string, string> = {
  todai: "東京大学",
};

export function PastExamYearDetailPage() {
  const { slug = "", year: yearParam = "" } = useParams();
  const { displayList } = usePastExamUniversities();
  const year = Number(yearParam);
  const { getIdToken } = useAuth();

  const [examYear, setExamYear] = useState<ExamYearSummary | null>(null);
  const [questions, setQuestions] = useState<PastQuestionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!slug || !year) return;
    setLoadError(null);
    setLoading(true);
    const token = await getIdToken();
    if (!token) {
      setLoadError("ログインが必要です");
      setLoading(false);
      return;
    }
    try {
      const data = await apiClient.getExamYearDetail(token, slug, year);
      setExamYear(data.examYear);
      setQuestions(data.questions);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [getIdToken, slug, year]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const displayName = displayList.find((u) => u.slug === slug)?.name ?? UNIVERSITY_NAMES[slug] ?? slug;
  const listeningScripts = examYear?.listeningScripts ?? [];

  const statusText = useMemo(() => {
    if (examYear?.importStatus === "approved") return "承認済み";
    if (examYear) return "ドラフト";
    return "分析・修正を追加できます";
  }, [examYear]);

  return (
    <div>
      <PageHeader
        title={`${displayName} ${year} 年度`}
        description={
          loading
            ? "読み込み中..."
            : `${statusText} · 大問 ${questions.length} 件`
        }
      />
      <div className="page-content space-y-6">
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="ghost" className="min-h-11 gap-2">
            <Link to={`/past-exams/${slug}`}>
              <ArrowLeft className="h-4 w-4" />
              年度一覧へ
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 gap-2">
            <Link to={`/past-exams/${slug}/import?year=${year}`}>
              <Plus className="h-4 w-4" />
              PDF を取り込む・再取り込み
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            disabled={loading}
            onClick={() => loadDetail()}
          >
            <RefreshCw className="h-4 w-4" />
            再読み込み
          </Button>
        </div>

        <TeacherExamMaterialsPanel universitySlug={slug} year={year} />

        <section className="space-y-4">
          <div>
            <h2 className="font-ja text-xl font-semibold">大問一覧</h2>
            <p className="mt-1 font-ja text-sm text-slate-500">
              PDF 取り込み後に表示されます。後から再取り込みで修正できます。
            </p>
          </div>

          {loading ? (
            <InlineLoading message="大問一覧を読み込み中..." />
          ) : loadError ? (
            <Card className="border-red-200 bg-red-50 p-6">
              <p className="font-ja text-sm text-red-800">{loadError}</p>
              <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={() => loadDetail()}>
                再読み込み
              </Button>
            </Card>
          ) : questions.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="font-ja text-slate-600">まだ大問データがありません。</p>
              <p className="mt-2 font-ja text-sm text-slate-500">
                上の「教師分析資料」は今すぐ保存できます。PDF の取り込みは後からでも構いません。
              </p>
              <Button asChild className="mt-6 min-h-11">
                <Link to={`/past-exams/${slug}/import?year=${year}`}>PDF を取り込む</Link>
              </Button>
            </Card>
          ) : (
            questions.map((q) => (
              <Card key={q.id} className="p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-ja font-semibold">
                    第{q.majorOrder}問{q.partLabel ? ` ${q.partLabel}` : ""}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-ja text-xs text-slate-600">
                    {ANSWER_FORMAT_LABELS[resolveAnswerFormat(q.answerFormat as AnswerFormat | undefined, q.prompt)]}
                  </span>
                </div>
                {q.prompt ? (
                  <details className="mt-3" open={q.prompt.length < 400}>
                    <summary className="cursor-pointer font-ja text-sm text-blue-800">
                      問題文を表示
                      {q.prompt.length >= 400 ? `（${q.prompt.length} 文字）` : ""}
                    </summary>
                    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 p-4">
                      <QuestionPromptBlock prompt={q.prompt} />
                    </div>
                  </details>
                ) : (
                  <p className="mt-3 font-ja text-sm text-slate-400">（問題文未入力）</p>
                )}
                {q.modelAnswer && (
                  <details className="mt-4">
                    <summary className="cursor-pointer font-ja text-sm text-blue-800">模範解答を表示</summary>
                    <p className="mt-2 whitespace-pre-wrap font-en text-sm leading-relaxed text-slate-700">
                      {q.modelAnswer}
                    </p>
                  </details>
                )}
              </Card>
            ))
          )}
        </section>

        {!loading && listeningScripts.length > 0 && (
          <section className="space-y-4">
            <h2 className="font-ja text-xl font-semibold">リスニング脚本</h2>
            {listeningScripts.map((script, index) => (
              <Card key={index} className="p-6">
                <h3 className="font-ja font-semibold">{script.title || `脚本 ${index + 1}`}</h3>
                <p className="mt-3 whitespace-pre-wrap font-en text-sm leading-relaxed text-slate-700">
                  {script.content}
                </p>
              </Card>
            ))}
          </section>
        )}

        {examYear?.parseNotes && (
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="font-ja text-base">取り込みメモ</CardTitle>
              <CardDescription className="whitespace-pre-wrap font-ja leading-relaxed text-slate-700">
                {examYear.parseNotes}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
