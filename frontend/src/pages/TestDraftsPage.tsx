import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ListChecks, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { QuestionPromptBlock } from "@/lib/question-text-format";
import type {
  CoverageLevel,
  QuestionValidityItem,
  TestDraftSet,
} from "@/types/question-design";

const COVERAGE_STYLE: Record<CoverageLevel, { label: string; className: string }> = {
  sufficient: { label: "十分", className: "bg-emerald-100 text-emerald-800" },
  partial: { label: "概ね可", className: "bg-amber-100 text-amber-800" },
  insufficient: { label: "要改善", className: "bg-red-100 text-red-800" },
};

function CoverageBadge({ coverage }: { coverage: CoverageLevel }) {
  const style = COVERAGE_STYLE[coverage] ?? COVERAGE_STYLE.partial;
  return (
    <span className={`rounded-full px-2.5 py-0.5 font-ja text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  );
}

export function TestDraftsPage() {
  const { getIdToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("focus");

  const [drafts, setDrafts] = useState<TestDraftSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      setLoading(false);
      return;
    }
    try {
      const res = await apiClient.listTestDrafts(token);
      setDrafts(res.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "セット下書きの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const validityByOrder = (draft: TestDraftSet): Map<number, QuestionValidityItem> => {
    const map = new Map<number, QuestionValidityItem>();
    for (const item of draft.validityReport?.items ?? []) {
      map.set(item.questionOrder, item);
    }
    return map;
  };

  const handlePromote = async (draft: TestDraftSet) => {
    setBusyId(draft.id);
    setError(null);
    const token = await getIdToken();
    if (!token) return;
    try {
      const result = await apiClient.promoteTestDraftAsNewTest(token, draft.id, draft.title);
      navigate(`/tests/${result.testId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "問題セットの作成に失敗しました");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (draftId: string) => {
    if (!window.confirm("このセット下書きを削除しますか？")) return;
    const token = await getIdToken();
    if (!token) return;
    try {
      await apiClient.deleteTestDraft(token, draftId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  return (
    <div>
      <PageHeader
        title="セット下書き（検証付き）"
        description="複数問をまとめて生成し、想定誤答と過去問との妥当性検証まで済ませた下書きです。内容を確認し、問題セットとして確定してください"
      />
      <div className="page-content space-y-6">
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="ghost" className="min-h-11 gap-2">
            <Link to="/tests">
              <ArrowLeft className="h-4 w-4" />
              問題セット一覧
            </Link>
          </Button>
          <Button asChild className="min-h-11 gap-2">
            <Link to="/questions/generate">
              <Sparkles className="h-4 w-4" />
              新規生成
            </Link>
          </Button>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50 p-4">
            <p className="font-ja text-sm text-red-800">{error}</p>
          </Card>
        )}

        {loading ? (
          <InlineLoading message="セット下書きを読み込み中..." />
        ) : drafts.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="font-ja text-slate-600">セット下書きはまだありません。</p>
            <Button asChild className="mt-4 min-h-11 gap-2">
              <Link to="/questions/generate">
                <ListChecks className="h-4 w-4" />
                セット下書きを作る
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {drafts.map((draft) => {
              const isBusy = busyId === draft.id;
              const vMap = validityByOrder(draft);
              const highlighted = focusId === draft.id;
              return (
                <Card
                  key={draft.id}
                  className={`space-y-5 p-6 ${highlighted ? "ring-2 ring-blue-300" : ""}`}
                >
                  <CardHeader className="p-0">
                    <CardTitle className="font-ja text-lg">{draft.title}</CardTitle>
                    <CardDescription className="font-ja">
                      {draft.universitySlug} · {draft.questionCount}問 · {draft.totalPoints}点
                      {draft.studentName ? ` · 対象: ${draft.studentName}` : ""}
                    </CardDescription>
                  </CardHeader>

                  {draft.weaknessFocus && (
                    <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                      <p className="font-ja text-xs font-medium text-blue-900">
                        カルテの弱点を反映
                      </p>
                      <p className="mt-1 whitespace-pre-wrap font-ja text-xs text-blue-900/80">
                        {draft.weaknessFocus}
                      </p>
                    </div>
                  )}

                  {draft.validityReport ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="font-ja text-xs font-medium text-slate-600">
                        過去問との妥当性検証
                        {draft.autoRetried ? "（不足を検出し自動で1回作り直しました）" : ""}
                      </p>
                      <p className="mt-1 font-ja text-sm text-slate-700">
                        {draft.validityReport.overallSummary}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                      <p className="font-ja text-xs text-amber-900">
                        参照できる過去問がないため妥当性検証は省略されました。内容は教師がご確認ください。
                      </p>
                    </div>
                  )}

                  <div className="space-y-4">
                    {draft.questions.map((q, i) => {
                      const order = i + 1;
                      const v = vMap.get(order);
                      return (
                        <div
                          key={`${draft.id}-${order}`}
                          className="rounded-lg border border-slate-200 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-ja text-sm font-medium text-slate-800">
                              {order}. {q.typeLabel}（{q.points}点）
                            </p>
                            {v && <CoverageBadge coverage={v.coverage} />}
                          </div>

                          <div className="mt-3">
                            <p className="font-ja text-xs font-medium text-slate-500">問題文</p>
                            <div className="mt-1 rounded-lg border border-slate-100 bg-slate-50 p-3">
                              <QuestionPromptBlock prompt={q.prompt} />
                            </div>
                          </div>

                          <div className="mt-3">
                            <p className="font-ja text-xs font-medium text-slate-500">模範解答</p>
                            <pre className="mt-1 whitespace-pre-wrap font-en text-sm leading-relaxed text-slate-800">
                              {q.modelAnswer}
                            </pre>
                          </div>

                          {q.anticipatedMistakes && q.anticipatedMistakes.length > 0 && (
                            <div className="mt-3">
                              <p className="font-ja text-xs font-medium text-slate-500">
                                想定誤答（採点・指導の準備用）
                              </p>
                              <ul className="mt-1 list-disc space-y-0.5 pl-5 font-ja text-sm text-slate-700">
                                {q.anticipatedMistakes.map((m, j) => (
                                  <li key={j}>{m}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {v && v.improvements.length > 0 && (
                            <div className="mt-3 rounded-lg bg-slate-50 p-3">
                              <p className="font-ja text-xs font-medium text-slate-500">
                                検証からの改善ヒント
                              </p>
                              <ul className="mt-1 list-disc space-y-0.5 pl-5 font-ja text-sm text-slate-600">
                                {v.improvements.map((imp, j) => (
                                  <li key={j}>{imp}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <Button
                      variant="ghost"
                      className="min-h-11 text-red-700 hover:text-red-800"
                      disabled={isBusy}
                      onClick={() => void handleDelete(draft.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      下書きを削除
                    </Button>
                    <Button
                      className="min-h-11 gap-2"
                      disabled={isBusy}
                      onClick={() => void handlePromote(draft)}
                    >
                      {isBusy ? "作成中..." : "問題セットとして確定（エディタを開く）"}
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
