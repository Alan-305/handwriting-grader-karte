import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Check, RefreshCw } from "lucide-react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { PageHeader } from "@/components/layout/AppShell";
import { ErrorRetry } from "@/components/feedback/ErrorRetry";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { CompositionFeedbackSections } from "@/components/grading/CompositionFeedbackSections";
import { GradeBadge } from "@/components/grading/GradeBadge";
import { PastExamAdviceEditor } from "@/components/sessions/PastExamAdviceEditor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  useSession,
  useUpdateQuestionResults,
} from "@/hooks/useSession";
import { apiClient } from "@/lib/api-client";
import { getDb } from "@/lib/firebase";
import {
  isCompositionResult,
  isComprehensiveReadingResult,
  modelAnswerForPrint,
  shouldShowModelAnswerPanel,
  sortQuestionResults,
  studentAnswerForPrint,
} from "@/lib/question-results";
import { formatGradingProgressMessage } from "@/lib/session-progress-message";
import type { GradeLevel, QuestionResult } from "@/types/firestore";
import type { SessionPastExamAdvice } from "@/types/past-exam-advice";

const GRADES: GradeLevel[] = ["優", "良", "不可"];

function resultLabel(r: QuestionResult): string {
  return r.partLabel ? `第${r.order}問 ${r.partLabel}` : `第${r.order}問`;
}

type ReviewLocationState = {
  adviceError?: string;
};

export function SessionGradingReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { getIdToken } = useAuth();
  const { session, results, loading } = useSession(sessionId);
  const { saveResults, syncSessionScores } = useUpdateQuestionResults(sessionId);

  const [drafts, setDrafts] = useState<QuestionResult[]>([]);
  const [advice, setAdvice] = useState<SessionPastExamAdvice | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [generatingAdvice, setGeneratingAdvice] = useState(false);
  const [regrading, setRegrading] = useState(false);
  const [error, setError] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const [adviceError, setAdviceError] = useState(
    () => (location.state as ReviewLocationState | null)?.adviceError ?? "",
  );

  useEffect(() => {
    setDrafts(sortQuestionResults(results));
  }, [results]);

  useEffect(() => {
    if (session?.pastExamAdvice) {
      setAdvice(session.pastExamAdvice);
    }
  }, [session?.pastExamAdvice]);

  useEffect(() => {
    if (!session || loading) return;
    if (session.gradingConfirmedAt) {
      navigate(`/sessions/${sessionId}`, { replace: true });
    }
  }, [session, loading, navigate, sessionId]);

  const sortedDrafts = useMemo(() => sortQuestionResults(drafts), [drafts]);

  const progressMessage = useMemo(() => {
    const fromSession = formatGradingProgressMessage(session?.gradingProgress);
    if (fromSession) return fromSession;
    if (generatingAdvice) return "過去問視点のアドバイスを生成中";
    return null;
  }, [session?.gradingProgress, generatingAdvice]);

  const updateDraft = (id: string, patch: Partial<QuestionResult>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const persistAdvice = async (payload: SessionPastExamAdvice) => {
    if (!sessionId) return;
    await updateDoc(doc(getDb(), "sessions", sessionId), {
      pastExamAdvice: payload,
      updatedAt: serverTimestamp(),
    });
  };

  const handleGenerateAdvice = async () => {
    if (!sessionId) return;
    setGeneratingAdvice(true);
    setAdviceError("");
    setError("");
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await apiClient.generatePastExamAdvice(token, sessionId);
      setAdvice(res.advice);
    } catch (e) {
      setAdviceError(e instanceof Error ? e.message : "過去問アドバイスの生成に失敗しました");
    } finally {
      setGeneratingAdvice(false);
    }
  };

  const handleRegrade = async () => {
    if (!sessionId) return;
    setRegrading(true);
    setError("");
    setAdviceError("");
    try {
      await saveResults(sortedDrafts);
      const token = await getIdToken();
      if (!token) return;
      await apiClient.gradeSession(token, sessionId);
      try {
        const res = await apiClient.generatePastExamAdvice(token, sessionId);
        setAdvice(res.advice);
      } catch (adviceErr) {
        setAdviceError(
          adviceErr instanceof Error ? adviceErr.message : "過去問アドバイスの再生成に失敗しました",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "再採点に失敗しました");
    } finally {
      setRegrading(false);
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setError("");
    setDraftSaved(false);
    try {
      await saveResults(sortedDrafts);
      await syncSessionScores(sortedDrafts);
      if (advice) await persistAdvice(advice);
      setDraftSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!advice) {
      setError("過去問視点のアドバイスが未生成です。生成してから確定してください。");
      return;
    }
    setConfirming(true);
    setError("");
    try {
      await saveResults(sortedDrafts.map((d) => ({ ...d, teacherReviewed: true })));
      await syncSessionScores(sortedDrafts);
      await persistAdvice(advice);
      const token = await getIdToken();
      if (!token || !sessionId) return;
      await apiClient.confirmGrading(token, sessionId);
      navigate(`/sessions/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "確定に失敗しました");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return <div className="page-content font-ja text-slate-500">読み込み中...</div>;
  }

  return (
    <div>
      <LoadingOverlay
        visible={confirming || regrading || Boolean(progressMessage)}
        message={
          confirming ? "確定中" : regrading ? "修正内容で再採点中" : progressMessage ?? "処理中"
        }
      />
      <PageHeader
        title="添削内容の確認"
        description="添削結果と過去問視点のアドバイスを確認・修正してから確定してください"
      />

      <div className="page-content mx-auto max-w-3xl space-y-6">
        <Card className="border-amber-100 bg-amber-50/80 p-4 font-ja text-sm leading-relaxed text-slate-800">
          <p>
            この画面で<strong>確定するまで</strong>、生徒への返却・カルテ集計は完了しません。
            自由英作文は「総評」「内容について」「文法・語法・表現について」「完成版」の4部構成で表示されます。
          </p>
          <p className="mt-2">
            「あなたの解答」を修正した場合は、<strong>修正内容で再採点</strong>を押してから確定してください。
            採点・講評・過去問アドバイスが解答内容に合わせて更新されます。
          </p>
          <p className="mt-2 text-slate-600">
            <strong>下書き保存</strong>したあと再開するには、
            <strong>生徒</strong> → 該当生徒の<strong>「過去の添削・面談」</strong>
            → <strong>「添削確認を続ける（下書き）」</strong>から開けます（サイドバーの「下書き」は問題生成用です）。
          </p>
        </Card>

        {draftSaved && (
          <Card className="border-green-200 bg-green-50 p-4 font-ja text-sm text-green-900">
            下書きを保存しました。あとから
            <strong> 生徒 → 過去の添削・面談 → 添削確認を続ける（下書き）</strong>
            で再開できます。
          </Card>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button className="min-h-11 w-full sm:w-auto" variant="outline" onClick={handleSaveDraft} disabled={saving || confirming || generatingAdvice || regrading}>
            下書き保存
          </Button>
          <Button
            className="min-h-11 w-full gap-2 sm:w-auto"
            variant="outline"
            onClick={handleRegrade}
            disabled={saving || confirming || generatingAdvice || regrading}
          >
            <RefreshCw className={`h-4 w-4 ${regrading ? "animate-spin" : ""}`} />
            修正内容で再採点
          </Button>
          <Button className="min-h-11 w-full gap-2 sm:w-auto" onClick={handleConfirm} disabled={saving || confirming || generatingAdvice || regrading || !advice}>
            <Check className="h-4 w-4" />
            内容を確定する
          </Button>
          {saving && <InlineLoading message="保存中..." />}
        </div>

        {error && <ErrorRetry message={error} onRetry={handleConfirm} />}

        <div className="space-y-6">
          {sortedDrafts.map((r) => {
            const studentText = studentAnswerForPrint(r, sortedDrafts);
            const modelText = modelAnswerForPrint(r, sortedDrafts);
            const isComposition = isCompositionResult(r);
            const isComprehensive = isComprehensiveReadingResult(r, sortedDrafts);
            const useSummaryLabel = isComposition || isComprehensive;
            return (
              <Card key={r.id} className="space-y-4 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="font-ja text-lg font-semibold">{resultLabel(r)}</h3>
                  {r.grade ? <GradeBadge grade={r.grade} /> : null}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="font-ja text-sm">評価</label>
                    <select
                      className="mt-1 flex h-11 w-full rounded-lg border px-3 font-ja text-sm"
                      value={r.grade ?? "良"}
                      onChange={(e) =>
                        updateDraft(r.id, { grade: e.target.value as GradeLevel })
                      }
                    >
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-ja text-sm">得点</label>
                    <Input
                      type="number"
                      min={0}
                      max={r.maxPoints}
                      value={r.score ?? 0}
                      onChange={(e) => updateDraft(r.id, { score: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex items-end font-ja text-sm text-slate-500">
                    / {r.maxPoints}点
                  </div>
                </div>

                <div>
                  <label className="font-ja text-sm">あなたの解答</label>
                  <Textarea
                    className="font-en mt-1"
                    rows={2}
                    value={studentText}
                    onChange={(e) =>
                      updateDraft(r.id, { studentAnswerText: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="font-ja text-sm">{useSummaryLabel ? "総評" : "講評"}</label>
                  <Textarea
                    className="mt-1 font-ja"
                    rows={useSummaryLabel ? 3 : 2}
                    value={r.feedback ?? ""}
                    onChange={(e) => updateDraft(r.id, { feedback: e.target.value })}
                  />
                </div>

                {isComposition ? (
                  <>
                    <div>
                      <label className="font-ja text-sm">内容について</label>
                      <Textarea
                        className="mt-1 font-ja"
                        rows={5}
                        placeholder="・良い点: …（改行）・改善点: …"
                        value={r.contentEvaluation ?? ""}
                        onChange={(e) =>
                          updateDraft(r.id, { contentEvaluation: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="font-ja text-sm">文法・語法・表現について</label>
                      <Textarea
                        className="mt-1 font-ja"
                        rows={5}
                        placeholder="・誤り → 正しい表現 — 理由"
                        value={r.grammarEvaluation ?? ""}
                        onChange={(e) =>
                          updateDraft(r.id, { grammarEvaluation: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="font-ja text-sm">完成版</label>
                      <Textarea
                        className="font-en mt-1"
                        rows={5}
                        value={r.polishedAnswer ?? ""}
                        onChange={(e) =>
                          updateDraft(r.id, { polishedAnswer: e.target.value })
                        }
                      />
                    </div>
                  </>
                ) : isComprehensive ? (
                  <>
                    <div>
                      <label className="font-ja text-sm">解説</label>
                      <Textarea
                        className="mt-1 font-ja"
                        rows={6}
                        placeholder="・正答の根拠…（改行）・誤選肢の理由…"
                        value={r.explanation ?? ""}
                        onChange={(e) => updateDraft(r.id, { explanation: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="font-ja text-sm">模範解答（参考）</label>
                      <Textarea
                        className="font-en mt-1"
                        rows={3}
                        value={modelText}
                        onChange={(e) => updateDraft(r.id, { modelAnswer: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="font-ja text-sm">解説</label>
                    <Textarea
                      className="mt-1 font-ja"
                      rows={6}
                      placeholder="(1) 正解：…（改行）(2) 不正解：…"
                      value={r.explanation ?? ""}
                      onChange={(e) => updateDraft(r.id, { explanation: e.target.value })}
                    />
                  </div>
                )}

                {shouldShowModelAnswerPanel(r, sortedDrafts) && !isComprehensive ? (
                  <div>
                    <label className="font-ja text-sm">模範解答（参考）</label>
                    <Textarea
                      className="font-en mt-1"
                      rows={2}
                      value={modelText}
                      onChange={(e) => updateDraft(r.id, { modelAnswer: e.target.value })}
                    />
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>

        <section className="space-y-4 border-t border-slate-200 pt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-ja text-xl font-semibold text-slate-900">過去問視点のアドバイス</h2>
              <p className="mt-1 font-ja text-sm text-slate-600">
                総評・受験準備度・アドバイスカードのみ（コンパクト）。設問別は添削結果を参照してください。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-2"
              onClick={handleGenerateAdvice}
              disabled={generatingAdvice || confirming}
            >
              <RefreshCw className={`h-4 w-4 ${generatingAdvice ? "animate-spin" : ""}`} />
              {advice ? "再生成" : "生成する"}
            </Button>
          </div>

          {adviceError ? (
            <Card className="border-amber-200 bg-amber-50 p-4 font-ja text-sm text-amber-950">
              <p>{adviceError}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 min-h-11"
                onClick={handleGenerateAdvice}
                disabled={generatingAdvice}
              >
                過去問アドバイスを再試行
              </Button>
            </Card>
          ) : null}

          {advice ? (
            <PastExamAdviceEditor advice={advice} onChange={setAdvice} />
          ) : (
            !adviceError && (
              <Card className="p-4 font-ja text-sm text-slate-600">
                過去問視点のアドバイスがまだありません。「生成する」を押してください。
              </Card>
            )
          )}
        </section>

        <Button className="min-h-11 w-full gap-2" onClick={handleConfirm} disabled={confirming || generatingAdvice || regrading || !advice}>
          <Check className="h-4 w-4" />
          内容を確定する
        </Button>
        <Button variant="ghost" asChild className="w-full">
          <Link to={`/sessions/${sessionId}`}>結果画面を見る（未確定のまま）</Link>
        </Button>
      </div>
    </div>
  );
}
