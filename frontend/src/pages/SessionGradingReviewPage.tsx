import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { ErrorRetry } from "@/components/feedback/ErrorRetry";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { CompositionFeedbackSections } from "@/components/grading/CompositionFeedbackSections";
import { GradeBadge } from "@/components/grading/GradeBadge";
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
import {
  modelAnswerForPrint,
  sortQuestionResults,
  studentAnswerForPrint,
} from "@/lib/question-results";
import type { GradeLevel, QuestionResult } from "@/types/firestore";

const GRADES: GradeLevel[] = ["優", "良", "不可"];

function resultLabel(r: QuestionResult): string {
  return r.partLabel ? `第${r.order}問 ${r.partLabel}` : `第${r.order}問`;
}

export function SessionGradingReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { getIdToken } = useAuth();
  const { session, results, loading } = useSession(sessionId);
  const { saveResults, syncSessionScores } = useUpdateQuestionResults(sessionId);

  const [drafts, setDrafts] = useState<QuestionResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDrafts(sortQuestionResults(results));
  }, [results]);

  useEffect(() => {
    if (!session || loading) return;
    if (session.gradingConfirmedAt) {
      navigate(`/sessions/${sessionId}`, { replace: true });
    }
  }, [session, loading, navigate, sessionId]);

  const sortedDrafts = useMemo(() => sortQuestionResults(drafts), [drafts]);

  const updateDraft = (id: string, patch: Partial<QuestionResult>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setError("");
    try {
      await saveResults(sortedDrafts);
      await syncSessionScores(sortedDrafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setError("");
    try {
      await saveResults(sortedDrafts.map((d) => ({ ...d, teacherReviewed: true })));
      await syncSessionScores(sortedDrafts);
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
    return <div className="p-8 font-ja text-slate-500">読み込み中...</div>;
  }

  return (
    <div>
      <LoadingOverlay visible={confirming} message="確定中" />
      <PageHeader
        title="添削内容の確認"
        description="AIの採点・解説を確認・修正してから確定してください"
      />

      <div className="mx-auto max-w-3xl space-y-6 p-8">
        <Card className="border-amber-100 bg-amber-50/80 p-4 font-ja text-sm leading-relaxed text-slate-800">
          <p>
            この画面で<strong>確定するまで</strong>、生徒への返却・カルテ集計は完了しません。
            自由英作文は「内容」「文法」「完成版英文」の3部構成で表示されます。
          </p>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={saving || confirming}>
            下書き保存
          </Button>
          <Button className="min-h-11 gap-2" onClick={handleConfirm} disabled={saving || confirming}>
            <Check className="h-4 w-4" />
            添削を確定する
          </Button>
          {saving && <InlineLoading message="保存中..." />}
        </div>

        {error && <ErrorRetry message={error} onRetry={handleConfirm} />}

        <div className="space-y-6">
          {sortedDrafts.map((r) => {
            const studentText = studentAnswerForPrint(r, sortedDrafts);
            const modelText = modelAnswerForPrint(r, sortedDrafts);
            const isComposition = Boolean(
              r.contentEvaluation || r.grammarEvaluation || r.polishedAnswer,
            );
            return (
              <Card key={r.id} className="space-y-4 p-5">
                <div className="flex items-center justify-between">
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
                  <label className="font-ja text-sm">講評</label>
                  <Textarea
                    className="mt-1 font-ja"
                    rows={2}
                    value={r.feedback ?? ""}
                    onChange={(e) => updateDraft(r.id, { feedback: e.target.value })}
                  />
                </div>

                {isComposition ? (
                  <>
                    <div>
                      <label className="font-ja text-sm">内容の評価・解説</label>
                      <Textarea
                        className="mt-1 font-ja"
                        rows={4}
                        value={r.contentEvaluation ?? ""}
                        onChange={(e) =>
                          updateDraft(r.id, { contentEvaluation: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="font-ja text-sm">文法・語法の評価・解説</label>
                      <Textarea
                        className="mt-1 font-ja"
                        rows={4}
                        value={r.grammarEvaluation ?? ""}
                        onChange={(e) =>
                          updateDraft(r.id, { grammarEvaluation: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="font-ja text-sm">完成版英文</label>
                      <Textarea
                        className="font-en mt-1"
                        rows={4}
                        value={r.polishedAnswer ?? ""}
                        onChange={(e) =>
                          updateDraft(r.id, { polishedAnswer: e.target.value })
                        }
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="font-ja text-sm">解説</label>
                    <Textarea
                      className="mt-1 font-ja"
                      rows={4}
                      value={r.explanation ?? ""}
                      onChange={(e) => updateDraft(r.id, { explanation: e.target.value })}
                    />
                  </div>
                )}

                <div>
                  <label className="font-ja text-sm">模範解答（参考）</label>
                  <Textarea
                    className="font-en mt-1"
                    rows={2}
                    value={modelText}
                    onChange={(e) => updateDraft(r.id, { modelAnswer: e.target.value })}
                  />
                </div>
              </Card>
            );
          })}
        </div>

        <Button className="min-h-11 w-full gap-2" onClick={handleConfirm} disabled={confirming}>
          <Check className="h-4 w-4" />
          添削を確定する
        </Button>
        <Button variant="ghost" asChild className="w-full">
          <Link to={`/sessions/${sessionId}`}>結果画面を見る（未確定のまま）</Link>
        </Button>
      </div>
    </div>
  );
}
