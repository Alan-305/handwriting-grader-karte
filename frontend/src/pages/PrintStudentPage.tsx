import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, Edit3, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { StudentPrintLayout } from "@/components/print/PrintLayouts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useSavePrintArtifact,
  useSession,
  useUpdateQuestionResults,
} from "@/hooks/useSession";
import { exportElementToPdf, printElement } from "@/lib/pdf-export";
import {
  modelAnswerForPrint,
  sortQuestionResults,
  studentAnswerForPrint,
} from "@/lib/question-results";
import { sumResultScores, toScoreOutOf100 } from "@/lib/scoring";
import type { GradeLevel, QuestionResult } from "@/types/firestore";

type PrintMode = "edit" | "preview";

const GRADES: GradeLevel[] = ["優", "良", "不可"];

function resultLabel(r: QuestionResult): string {
  return r.partLabel ? `第${r.order}問 ${r.partLabel}` : `第${r.order}問`;
}

export function PrintStudentPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { session, results, loading } = useSession(sessionId);
  const { saveResults, setPrintFinalized, syncSessionScores } = useUpdateQuestionResults(sessionId);
  const { saveArtifact } = useSavePrintArtifact(sessionId ?? "");
  const printRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<PrintMode>("edit");
  const [drafts, setDrafts] = useState<QuestionResult[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setDrafts(sortQuestionResults(results));
  }, [results]);

  const sortedDrafts = useMemo(
    () => sortQuestionResults(drafts),
    [drafts],
  );

  useEffect(() => {
    if (session?.studentPrintFinalizedAt) {
      setMode("preview");
    }
  }, [session?.studentPrintFinalizedAt]);

  useEffect(() => {
    if (!session || loading) return;
    if (!session.gradingConfirmedAt) {
      navigate(`/sessions/${sessionId}/grading-review`, { replace: true });
    }
  }, [session, loading, navigate, sessionId]);

  const isDirty = useMemo(
    () => drafts.some((d) => {
      const orig = results.find((r) => r.id === d.id);
      return orig && JSON.stringify(d) !== JSON.stringify(orig);
    }),
    [drafts, results],
  );

  const updateDraft = (id: string, patch: Partial<QuestionResult>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    setSaveState("idle");
  };

  const persistDrafts = async () => {
    await saveResults(
      drafts.map((d) => ({
        id: d.id,
        studentAnswerText: d.studentAnswerText,
        explanation: d.explanation,
        modelAnswer: d.modelAnswer,
        grade: d.grade,
        score: d.score,
        maxPoints: d.maxPoints,
        feedback: d.feedback,
        contentEvaluation: d.contentEvaluation,
        grammarEvaluation: d.grammarEvaluation,
        polishedAnswer: d.polishedAnswer,
      })),
    );
    await syncSessionScores(drafts);
  };

  const handleSaveDraft = async () => {
    setSaveState("saving");
    setSaveError("");
    try {
      await persistDrafts();
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  const handleFinalize = async () => {
    setSaveState("saving");
    setSaveError("");
    try {
      await persistDrafts();
      await setPrintFinalized(true);
      setMode("preview");
      setSaveState("idle");
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  const handleBackToEdit = async () => {
    await setPrintFinalized(false);
    setMode("edit");
  };

  const handlePrint = () => {
    if (printRef.current) printElement(printRef.current);
  };

  const handlePdf = async () => {
    if (!printRef.current) return;
    await exportElementToPdf(printRef.current, `student-${sessionId}.pdf`);
    await saveArtifact("student", {
      sections: drafts.map((r) => ({
        questionOrder: r.order,
        studentAnswer: r.studentAnswerText ?? "",
        grade: r.grade ?? "良",
        explanation: r.explanation ?? "",
        modelAnswer: r.modelAnswer,
      })),
    });
  };

  const activeResults = sortedDrafts.length ? sortedDrafts : sortQuestionResults(results);
  const { totalScore, maxScore } = sumResultScores(activeResults);
  const totalScore100 = session
    ? (mode === "preview" && session.totalScore100 != null
        ? session.totalScore100
        : toScoreOutOf100(totalScore, maxScore))
    : 0;

  if (loading) return <div className="page-content font-ja">読み込み中...</div>;

  return (
    <div>
      <PageHeader
        title="生徒用返却プリント"
        description={
          mode === "edit"
            ? "AI生成内容を確認・修正してから確定してください"
            : "確定済み — 印刷またはPDF保存できます"
        }
      />

      <div className="no-print page-content space-y-4">
        {mode === "edit" ? (
          <>
            <Card className="border-blue-100 bg-blue-50/40 p-4">
              <p className="font-ja text-sm leading-relaxed text-slate-700">
                解説・解答の書き起こし・模範解答などを編集できます。
                内容を確認したら<strong>「確定して印刷プレビュー」</strong>を押してください。確定後に印刷します。
              </p>
            </Card>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button className="min-h-11 w-full sm:w-auto" variant="outline" onClick={handleSaveDraft} disabled={saveState === "saving" || !isDirty}>
                下書きを保存
              </Button>
              <Button className="min-h-11 w-full gap-2 sm:w-auto" onClick={handleFinalize} disabled={saveState === "saving"}>
                <Check className="h-4 w-4" />
                確定して印刷プレビュー
              </Button>
              <Button className="min-h-11 w-full sm:w-auto" variant="ghost" asChild>
                <Link to={`/sessions/${sessionId}`}>結果に戻る</Link>
              </Button>
            </div>
            {saveState === "saving" && <InlineLoading message="保存中..." />}
            {saveState === "saved" && (
              <p className="font-ja text-sm text-green-700">下書きを保存しました</p>
            )}
            {saveState === "error" && (
              <p className="font-ja text-sm text-red-600">
                {saveError || "保存に失敗しました"}
              </p>
            )}

            <div className="space-y-4">
              {sortedDrafts.map((r) => {
                const modelText = modelAnswerForPrint(r, sortedDrafts);
                const studentText = studentAnswerForPrint(r, sortedDrafts);
                const isComposition = Boolean(
                  r.contentEvaluation || r.grammarEvaluation || r.polishedAnswer,
                );
                return (
                <Card key={r.id} className="space-y-3 p-4">
                  <h3 className="font-ja font-semibold">{resultLabel(r)}</h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="font-ja text-sm">評価</label>
                      <select
                        className="mt-1 flex h-11 w-full rounded-lg border px-3 font-ja text-sm"
                        value={r.grade}
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
                        value={r.score}
                        onChange={(e) => updateDraft(r.id, { score: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex items-end font-ja text-sm text-slate-500">
                      / {r.maxPoints}点
                      {sortedDrafts.filter((x) => x.order === r.order && x.questionId === r.questionId).length > 1 && (
                        <span className="ml-1 text-xs">（小問配分）</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="font-ja text-sm">あなたの解答（書き起こし）</label>
                    <Textarea
                      className="font-en mt-1"
                      rows={2}
                      value={studentText}
                      onChange={(e) => updateDraft(r.id, { studentAnswerText: e.target.value })}
                    />
                  </div>
                  {isComposition ? (
                    <>
                      <div>
                        <label className="font-ja text-sm">内容の評価・解説</label>
                        <Textarea
                          className="mt-1 font-ja"
                          rows={3}
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
                          rows={3}
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
                          rows={3}
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
                    <label className="font-ja text-sm">模範解答（プリント掲載）</label>
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
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button className="gap-2" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              印刷
            </Button>
            <Button variant="outline" onClick={handlePdf}>
              PDF保存
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleBackToEdit}>
              <Edit3 className="h-4 w-4" />
              編集に戻る
            </Button>
            <Button variant="ghost" asChild>
              <Link to={`/sessions/${sessionId}`}>結果に戻る</Link>
            </Button>
          </div>
        )}
      </div>

      {mode === "preview" && (
        <div ref={printRef} className="bg-slate-100 p-8 print:bg-white print:p-0">
          <StudentPrintLayout
            results={activeResults}
            totalScore100={totalScore100}
          />
        </div>
      )}
    </div>
  );
}
