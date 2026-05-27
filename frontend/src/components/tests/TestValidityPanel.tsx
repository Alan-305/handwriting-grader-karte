import { useEffect, useState } from "react";
import { ClipboardCheck, X } from "lucide-react";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { usePastExamUniversities } from "@/hooks/usePastExamUniversities";
import { apiClient } from "@/lib/api-client";
import type { Question } from "@/types/firestore";
import type { ValidityReport } from "@/types/question-design";

const COVERAGE_STYLES: Record<string, string> = {
  sufficient: "bg-green-100 text-green-900",
  partial: "bg-amber-100 text-amber-900",
  insufficient: "bg-orange-100 text-orange-900",
};

const FIELD_LABELS: Record<string, string> = {
  prompt: "問題文",
  modelAnswer: "模範解答",
  points: "配点",
  instructions: "指示文",
};

interface TestValidityPanelProps {
  testId: string;
  draftQuestions: Question[];
  onApplyRevision: (questionOrder: number, field: string, value: string) => void;
}

export function TestValidityPanel({ testId, draftQuestions, onApplyRevision }: TestValidityPanelProps) {
  const { getIdToken } = useAuth();
  const { displayList: universityOptions } = usePastExamUniversities();
  const [open, setOpen] = useState(false);
  const [universitySlug, setUniversitySlug] = useState("todai");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ValidityReport | null>(null);

  useEffect(() => {
    if (universityOptions.length > 0 && !universityOptions.some((u) => u.slug === universitySlug)) {
      setUniversitySlug(universityOptions[0].slug);
    }
  }, [universityOptions, universitySlug]);

  const runCheck = async () => {
    if (draftQuestions.length === 0) {
      setError("設問を1つ以上入力してから照合してください");
      return;
    }
    setChecking(true);
    setError(null);
    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      setChecking(false);
      return;
    }
    try {
      const res = await apiClient.runValidityCheck(token, testId, {
        universitySlug,
        questions: draftQuestions.map((q) => ({
          order: q.order,
          type: q.type,
          prompt: q.prompt,
          modelAnswer: q.modelAnswer,
          points: q.points,
        })),
      });
      setReport(res.report);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "照合に失敗しました");
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <LoadingOverlay visible={checking} message="考えてます" />
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[12rem] flex-1">
          <label className="font-ja text-xs text-slate-600">参照する過去問（大学）</label>
          <select
            className="mt-1 flex h-11 w-full rounded-lg border border-slate-200 px-3 font-ja text-sm"
            value={universitySlug}
            onChange={(e) => setUniversitySlug(e.target.value)}
          >
            {universityOptions.map((u) => (
              <option key={u.slug} value={u.slug}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" className="min-h-11 gap-2 sm:shrink-0" onClick={() => void runCheck()} disabled={checking}>
          <ClipboardCheck className="h-4 w-4" />
          過去問と照合
        </Button>
      </div>

      {error && !open && <p className="w-full font-ja text-sm text-red-700">{error}</p>}

      {open && report && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-12 backdrop-blur-sm">
          <Card className="relative w-full max-w-3xl space-y-6 p-6 shadow-xl">
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-3 top-3 min-h-11 min-w-11"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="font-ja text-xl font-semibold text-slate-900">過去問との照合結果</h2>
              <p className="mt-2 font-ja text-sm leading-relaxed text-slate-700">{report.overallSummary}</p>
            </div>

            <div className="space-y-5">
              {report.items.map((item) => (
                <div key={item.questionOrder} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-ja font-semibold">第{item.questionOrder}問</h3>
                    {item.matchedTypeLabel && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-ja text-xs text-slate-700">
                        {item.matchedTypeLabel}
                      </span>
                    )}
                    <span
                      className={`rounded px-2 py-0.5 font-ja text-xs ${COVERAGE_STYLES[item.coverage] ?? "bg-slate-100"}`}
                    >
                      {item.coverageLabel ?? item.coverage}
                    </span>
                  </div>
                  <p className="mt-2 font-ja text-sm leading-relaxed text-slate-700">{item.summary}</p>

                  {item.referencedPastQuestions.length > 0 && (
                    <p className="mt-2 font-ja text-xs text-slate-500">
                      参照: {item.referencedPastQuestions.join("、")}
                    </p>
                  )}

                  {item.improvements.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 font-ja text-sm text-slate-700">
                      {item.improvements.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                  )}

                  {item.revisionSuggestions.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <p className="font-ja text-sm font-medium text-slate-800">具体的な修正提案</p>
                      {item.revisionSuggestions.map((rev, idx) => (
                        <div key={`${item.questionOrder}-${idx}`} className="rounded-lg bg-blue-50/60 p-3">
                          <p className="font-ja text-xs font-medium text-blue-900">
                            {FIELD_LABELS[rev.field] ?? rev.field}
                          </p>
                          {rev.currentExcerpt && (
                            <p className="mt-1 font-ja text-xs text-slate-600">現状: {rev.currentExcerpt}</p>
                          )}
                          <pre className="mt-2 whitespace-pre-wrap font-ja text-sm text-slate-800">
                            {rev.proposedText}
                          </pre>
                          <p className="mt-2 font-ja text-xs leading-relaxed text-slate-600">{rev.reason}</p>
                          {(rev.field === "prompt" || rev.field === "modelAnswer" || rev.field === "points") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2 min-h-11"
                              onClick={() => {
                                const value =
                                  rev.field === "points"
                                    ? String(Number(rev.proposedText) || rev.proposedText)
                                    : rev.proposedText;
                                onApplyRevision(item.questionOrder, rev.field, value);
                              }}
                            >
                              この提案を反映
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button className="min-h-11" onClick={() => setOpen(false)}>
                閉じる
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
