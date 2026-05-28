import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, Edit3, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { GradingPrintControlsPanel } from "@/components/print/GradingPrintControlsPanel";
import { GradingPrintQuestionEditor } from "@/components/print/GradingPrintQuestionEditor";
import { StudentPrintLayout } from "@/components/print/PrintLayouts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useSavePrintArtifact,
  useSession,
  useUpdateQuestionResults,
} from "@/hooks/useSession";
import { useGradingPrintPreferences } from "@/hooks/useGradingPrintPreferences";
import { exportElementToPdf, printElement } from "@/lib/pdf-export";
import { isQuestionIncluded } from "@/lib/grading-print-config";
import { sortQuestionResults } from "@/lib/question-results";
import { sumResultScores, toScoreOutOf100 } from "@/lib/scoring";
import type { StudentPrintSections } from "@/lib/grading-print-config";
import type { QuestionResult } from "@/types/firestore";

type PrintMode = "edit" | "preview";

export function PrintStudentPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { session, results, loading } = useSession(sessionId);
  const { saveResults, setPrintFinalized, syncSessionScores } = useUpdateQuestionResults(sessionId);
  const { saveArtifact } = useSavePrintArtifact(sessionId ?? "");
  const printRef = useRef<HTMLDivElement>(null);

  const {
    prefs,
    setSections,
    setLayout,
    setQuestionIncluded,
    resetLayout,
    resetSections,
    templates,
    saveTemplate,
    applyTemplate,
    deleteTemplate,
  } = useGradingPrintPreferences("student");

  const [mode, setMode] = useState<PrintMode>("edit");
  const [drafts, setDrafts] = useState<QuestionResult[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setDrafts(sortQuestionResults(results));
  }, [results]);

  const sortedDrafts = useMemo(() => sortQuestionResults(drafts), [drafts]);

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
    () =>
      drafts.some((d) => {
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
      sections: sortedDrafts.map((r) => ({
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
    ? mode === "preview" && session.totalScore100 != null
      ? session.totalScore100
      : toScoreOutOf100(totalScore, maxScore)
    : 0;

  if (loading) return <div className="page-content font-ja">読み込み中...</div>;

  return (
    <div>
      <PageHeader
        title="生徒用返却プリント"
        description={
          mode === "edit"
            ? "文言の修正・掲載項目の選択・レイアウト調整のあと、確定して印刷してください"
            : "確定済み — 掲載項目とレイアウトを変えてから印刷・PDF保存できます"
        }
      />

      <div className="no-print page-content space-y-4">
        <GradingPrintControlsPanel
          kind="student"
          prefs={prefs}
          onSectionsChange={setSections}
          onLayoutChange={setLayout}
          onResetLayout={resetLayout}
          onResetSections={resetSections}
          templates={templates}
          onSaveTemplate={saveTemplate}
          onApplyTemplate={applyTemplate}
          onDeleteTemplate={deleteTemplate}
        />

        {mode === "edit" ? (
          <>
            <Card className="border-blue-100 bg-blue-50/40 p-4">
              <p className="font-ja text-sm leading-relaxed text-slate-700">
                解説・講評・模範解答などの<strong>文言を修正</strong>できます。下のプレビューで掲載項目とレイアウトを確認し、
                <strong>「確定して印刷プレビュー」</strong>のあと印刷してください。
              </p>
            </Card>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                className="min-h-11 w-full sm:w-auto"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={saveState === "saving" || !isDirty}
              >
                下書きを保存
              </Button>
              <Button
                className="min-h-11 w-full gap-2 sm:w-auto"
                onClick={handleFinalize}
                disabled={saveState === "saving"}
              >
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
              {sortedDrafts.map((r) => (
                <GradingPrintQuestionEditor
                  key={r.id}
                  result={r}
                  allResults={sortedDrafts}
                  kind="student"
                  included={isQuestionIncluded(prefs.includedQuestions, r.id)}
                  onIncludedChange={(included) => setQuestionIncluded(r.id, included)}
                  onChange={(patch) => updateDraft(r.id, patch)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11 gap-2" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              印刷
            </Button>
            <Button className="min-h-11" variant="outline" onClick={handlePdf}>
              PDF保存
            </Button>
            <Button className="min-h-11 gap-2" variant="outline" onClick={handleBackToEdit}>
              <Edit3 className="h-4 w-4" />
              文言・設定を編集
            </Button>
            <Button className="min-h-11" variant="ghost" asChild>
              <Link to={`/sessions/${sessionId}`}>結果に戻る</Link>
            </Button>
          </div>
        )}

        {mode === "edit" && (
          <p className="font-ja text-sm text-slate-500">
            下のプレビューが印刷イメージです。掲載項目のチェックを変えるとすぐ反映されます。
          </p>
        )}
      </div>

      <div ref={printRef} className="bg-slate-100 p-8 print:bg-white print:p-0">
        <StudentPrintLayout
          results={activeResults}
          totalScore100={totalScore100}
          sections={prefs.sections as StudentPrintSections}
          layout={prefs.layout}
          includedQuestions={prefs.includedQuestions}
        />
      </div>
    </div>
  );
}
