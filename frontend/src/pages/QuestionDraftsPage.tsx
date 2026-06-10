import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ArrowLeft, Plus, Sparkles, Trash2 } from "lucide-react";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { getDb } from "@/lib/firebase";
import type { Test } from "@/types/firestore";
import { QUESTION_TEXT_HINT, QuestionPromptBlock } from "@/lib/question-text-format";
import type { GeneratedQuestionDraft } from "@/types/question-design";

function defaultTestTitle(draft: GeneratedQuestionDraft) {
  return `${draft.typeLabel} 問題セット`;
}

export function QuestionDraftsPage() {
  const { user, getIdToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusDraftId = searchParams.get("focus");
  const [drafts, setDrafts] = useState<GeneratedQuestionDraft[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyDraftId, setBusyDraftId] = useState<string | null>(null);
  const [titleByDraft, setTitleByDraft] = useState<Record<string, string>>({});
  const [selectedTestByDraft, setSelectedTestByDraft] = useState<Record<string, string>>({});

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      setLoading(false);
      return;
    }
    try {
      const res = await apiClient.listQuestionDrafts(token);
      setDrafts(res.drafts);
      setTitleByDraft((prev) => {
        const next = { ...prev };
        for (const draft of res.drafts) {
          if (draft.id && !next[draft.id]) next[draft.id] = defaultTestTitle(draft);
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "下書きの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(getDb(), "tests"), where("teacherId", "==", user.uid));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Test);
      rows.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
      setTests(rows);
    });
  }, [user]);

  useEffect(() => {
    if (tests.length === 0 || drafts.length === 0) return;
    const defaultTestId = tests[0].id;
    setSelectedTestByDraft((prev) => {
      const next = { ...prev };
      for (const draft of drafts) {
        if (draft.id && !next[draft.id]) next[draft.id] = defaultTestId;
      }
      return next;
    });
  }, [tests, drafts]);

  const handleDelete = async (draftId: string) => {
    const token = await getIdToken();
    if (!token) return;
    if (!window.confirm("この下書きを削除しますか？")) return;
    try {
      await apiClient.deleteQuestionDraft(token, draftId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  const handleCreateNewTest = async (draftId: string) => {
    setBusyDraftId(draftId);
    setError(null);
    const token = await getIdToken();
    if (!token) return;
    try {
      const title = titleByDraft[draftId]?.trim();
      const result = await apiClient.promoteQuestionDraftAsNewTest(token, draftId, title);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      navigate(`/tests/${result.testId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "新規問題セットの作成に失敗しました");
    } finally {
      setBusyDraftId(null);
    }
  };

  const handleAppendToExisting = async (draftId: string) => {
    const testId = selectedTestByDraft[draftId];
    if (!testId) {
      setError("追加先の問題セットを選択してください");
      return;
    }
    setBusyDraftId(draftId);
    setError(null);
    const token = await getIdToken();
    if (!token) return;
    try {
      const result = await apiClient.promoteQuestionDraft(token, draftId, testId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      navigate(`/tests/${result.testId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "問題セットへの追加に失敗しました");
    } finally {
      setBusyDraftId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="生成下書き（問題・模範解答）"
        description="生成した問題文と模範解答の下書きです。新規問題セットとして使うのが基本で、必要なときだけ既存セットに追加できます"
      />
      <div className="page-content space-y-6">
        <Card className="border-amber-100 bg-amber-50/80 p-4 font-ja text-sm leading-relaxed text-slate-700">
          添削結果の<strong>下書き保存</strong>（講評の途中保存）はここではありません。
          <strong>生徒</strong> → 該当生徒の<strong>「過去の添削・面談」</strong>
          → <strong>「添削確認を続ける（下書き）」</strong>から再開してください。
        </Card>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="ghost" className="min-h-11 gap-2">
            <Link to="/tests">
              <ArrowLeft className="h-4 w-4" />
              問題セット一覧
            </Link>
          </Button>
          <Button asChild className="min-h-11 gap-2">
            <Link to="/past-exams">
              <Sparkles className="h-4 w-4" />
              過去問から問題を生成
            </Link>
          </Button>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50 p-4">
            <p className="font-ja text-sm text-red-800">{error}</p>
          </Card>
        )}

        {loading ? (
          <InlineLoading message="下書きを読み込み中..." />
        ) : drafts.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="font-ja text-slate-600">下書きはまだありません。</p>
            <Button asChild className="mt-4 min-h-11 gap-2">
              <Link to="/past-exams">
                <Plus className="h-4 w-4" />
                過去問から問題を生成する
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {drafts.map((draft) => {
              const draftId = draft.id ?? "";
              const isBusy = busyDraftId === draftId;
              const isQ1 = draft.generationPipeline === "q1";
              const isQ2 = draft.generationPipeline === "q2";
              const isQ5 = draft.generationPipeline === "q5";
              const isQ4A = draft.generationPipeline === "q4a";
              const isQ4B = draft.generationPipeline === "q4b";
              const isQ1A = draft.generationPipeline === "q1a";
              const isQ1B = draft.generationPipeline === "q1b";
              const isQ2A = draft.generationPipeline === "q2a";
              const isQ2B = draft.generationPipeline === "q2b";
              const artifacts = draft.generationArtifacts;
              const isFocused = focusDraftId === draftId;
              return (
                <Card
                  key={draftId}
                  className={`space-y-4 p-6 ${isFocused ? "ring-2 ring-blue-400" : ""}`}
                >
                  <CardHeader className="p-0">
                    <CardTitle className="font-ja text-lg">{draft.typeLabel}</CardTitle>
                    <CardDescription className="font-ja">
                      {draft.universitySlug} · {draft.points}点
                      {isQ1 ? " · 第1問（読解総合）パイプライン" : ""}
                      {isQ2 ? " · 第2問（読解総合）パイプライン" : ""}
                      {isQ5 ? " · 第5問パイプライン" : ""}
                      {isQ4A ? " · 第4問(A)パイプライン" : ""}
                      {isQ4B ? " · 第4問(B)パイプライン" : ""}
                      {isQ1A ? " · 第1問(A)パイプライン" : ""}
                      {isQ1B ? " · 第1問(B)パイプライン" : ""}
                      {isQ2A ? " · 第2問(A)パイプライン" : ""}
                      {isQ2B ? " · 第2問(B)パイプライン" : ""}
                      {draft.notes ? ` · ${draft.notes}` : ""}
                    </CardDescription>
                    {(isQ1 || isQ2 || isQ5 || isQ4A || isQ4B || isQ1A || isQ1B || isQ2A || isQ2B) && artifacts && (
                      <p className="mt-2 font-ja text-xs text-slate-600">
                        {artifacts.evaluatorPassed === false
                          ? "検証: 要確認（設問の曖昧さあり）"
                          : "検証: 問題なし"}
                        {artifacts.retriedQuestions || artifacts.retriedProblem
                          ? " · 1回再生成"
                          : ""}
                        {artifacts.themeSummary ? ` · ${artifacts.themeSummary}` : ""}
                      </p>
                    )}
                  </CardHeader>
                  <div>
                    <p className="font-ja text-xs font-medium text-slate-500">問題文</p>
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <QuestionPromptBlock prompt={draft.prompt} />
                    </div>
                    <p className="mt-2 font-ja text-xs text-slate-500">{QUESTION_TEXT_HINT}</p>
                  </div>
                  <div>
                    <p className="font-ja text-xs font-medium text-slate-500">模範解答</p>
                    <pre className="mt-1 whitespace-pre-wrap font-en text-sm leading-relaxed text-slate-800">
                      {draft.modelAnswer}
                    </pre>
                  </div>

                  <div className="space-y-4 border-t border-slate-100 pt-4">
                    <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4">
                      <p className="font-ja text-sm font-medium text-slate-800">新規問題セットとして使う</p>
                      <div className="mt-3">
                        <label className="font-ja text-xs text-slate-600">問題セット名</label>
                        <Input
                          className="mt-1 font-ja"
                          value={titleByDraft[draftId] ?? defaultTestTitle(draft)}
                          onChange={(e) =>
                            setTitleByDraft((prev) => ({ ...prev, [draftId]: e.target.value }))
                          }
                        />
                      </div>
                      <Button
                        className="mt-3 min-h-11"
                        disabled={isBusy}
                        onClick={() => draftId && void handleCreateNewTest(draftId)}
                      >
                        {isBusy ? "作成中..." : "新規問題セットとしてエディタを開く"}
                      </Button>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                      <p className="font-ja text-sm font-medium text-slate-700">既存の問題セットに追加する</p>
                      <div className="mt-3">
                        <label className="font-ja text-xs text-slate-600">追加先</label>
                        <select
                          className="mt-1 flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-ja text-sm"
                          value={selectedTestByDraft[draftId] ?? ""}
                          onChange={(e) =>
                            setSelectedTestByDraft((prev) => ({ ...prev, [draftId]: e.target.value }))
                          }
                        >
                          {tests.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button
                        variant="outline"
                        className="mt-3 min-h-11"
                        disabled={isBusy || !selectedTestByDraft[draftId]}
                        onClick={() => draftId && void handleAppendToExisting(draftId)}
                      >
                        既存セットに追加
                      </Button>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        className="min-h-11 text-red-700 hover:text-red-800"
                        disabled={isBusy}
                        onClick={() => draftId && void handleDelete(draftId)}
                      >
                        <Trash2 className="h-4 w-4" />
                        下書きを削除
                      </Button>
                    </div>
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
