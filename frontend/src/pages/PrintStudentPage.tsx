import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { Check, Edit3, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { SyncPreviewSplit } from "@/components/layout/SyncPreviewSplit";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { GradingPrintControlsPanel } from "@/components/print/GradingPrintControlsPanel";
import { GradingPrintQuestionEditor } from "@/components/print/GradingPrintQuestionEditor";
import { PrintPreviewPane } from "@/components/print/PrintPreviewPane";
import { StudentPrintLayout } from "@/components/print/PrintLayouts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  useSavePrintArtifact,
  useSession,
  useSessionsForStudent,
  useUpdateQuestionResults,
} from "@/hooks/useSession";
import { usePrintShortcut } from "@/hooks/usePrintShortcut";
import { useGradingPrintPreferences } from "@/hooks/useGradingPrintPreferences";
import { exportElementToPdf } from "@/lib/pdf-export";
import { printDocument } from "@/lib/print-layout-settings";
import { getDb } from "@/lib/firebase";
import { isQuestionIncluded } from "@/lib/grading-print-config";
import { sortQuestionResults, updateQuestionPassageTranslation } from "@/lib/question-results";
import { dedupeSessionsByTest } from "@/lib/session-list";
import { sumResultScores, toScoreOutOf100 } from "@/lib/scoring";
import type { StudentPrintSections } from "@/lib/grading-print-config";
import type { QuestionResult, Student } from "@/types/firestore";

type PrintMode = "edit" | "preview";

export function PrintStudentPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { session, results, loading } = useSession(sessionId);
  const studentSessions = useSessionsForStudent(session?.studentId);
  const { saveResults, setPrintFinalized, syncSessionScores } = useUpdateQuestionResults(sessionId);
  const { saveArtifact } = useSavePrintArtifact(sessionId ?? "");
  const printRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  usePrintShortcut(printRef);

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
  const [studentName, setStudentName] = useState("");
  const [drafts, setDrafts] = useState<QuestionResult[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setDrafts(sortQuestionResults(results));
  }, [results]);

  useEffect(() => {
    if (!session?.studentId) {
      setStudentName("");
      return;
    }
    return onSnapshot(doc(getDb(), "students", session.studentId), (snap) => {
      if (snap.exists()) {
        setStudentName((snap.data() as Student).name ?? "");
      } else {
        setStudentName("");
      }
    });
  }, [session?.studentId]);

  const sortedDrafts = useMemo(() => sortQuestionResults(drafts), [drafts]);

  const sessionNumber = useMemo(() => {
    if (!sessionId) return undefined;
    const chrono = dedupeSessionsByTest(studentSessions);
    const idx = chrono.findIndex((s) => s.id === sessionId);
    return idx >= 0 ? idx + 1 : undefined;
  }, [studentSessions, sessionId]);

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

  const updatePassageTranslation = (id: string, translation: string) => {
    setDrafts((prev) => updateQuestionPassageTranslation(prev, id, translation));
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
    printDocument();
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

  const editPane = (
    <div className="no-print space-y-4 p-4 pb-8 sm:p-6">
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
              解説・講評・模範解答などの<strong>文言を修正</strong>できます。右のプレビューで掲載項目とレイアウトを確認し、
              <strong>「確定」</strong>のあと印刷してください。
            </p>
          </Card>
          <div className="space-y-4">
            {sortedDrafts.map((r, index) => (
              <GradingPrintQuestionEditor
                key={r.id}
                result={r}
                allResults={sortedDrafts}
                kind="student"
                included={isQuestionIncluded(prefs.includedQuestions, r.id)}
                onIncludedChange={(included) => setQuestionIncluded(r.id, included)}
                onChange={(patch) => updateDraft(r.id, patch)}
                onPassageTranslationChange={(translation) =>
                  updatePassageTranslation(r.id, translation)
                }
                defaultOpen={index === 0}
              />
            ))}
          </div>
        </>
      ) : (
        <Card className="border-slate-200 bg-slate-50 p-4">
          <p className="font-ja text-sm leading-relaxed text-slate-700">
            確定済みです。右のプレビューを確認して印刷・PDF保存できます。「文言を編集」で修正に戻れます。
          </p>
        </Card>
      )}
    </div>
  );

  const previewPane = (
    <PrintPreviewPane
      title="印刷プレビュー"
      hint="掲載項目のチェックを変えるとすぐ反映されます"
      printRef={printRef}
      scrollRef={previewScrollRef}
    >
      <StudentPrintLayout
        results={activeResults}
        studentName={studentName}
        sessionNumber={sessionNumber}
        totalScore100={totalScore100}
        sections={prefs.sections as StudentPrintSections}
        layout={prefs.layout}
        includedQuestions={prefs.includedQuestions}
      />
    </PrintPreviewPane>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
      <PageHeader
        title="生徒用返却プリント"
        description={
          mode === "edit"
            ? "左で編集、右で印刷プレビュー（それぞれ独立してスクロール）"
            : "確定済み — 掲載項目とレイアウトを変えてから印刷・PDF保存できます"
        }
      />

      <div className="no-print shrink-0 space-y-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2">
          {mode === "edit" ? (
            <>
              <Button
                className="min-h-11"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={saveState === "saving" || !isDirty}
              >
                下書きを保存
              </Button>
              <Button
                className="min-h-11 gap-2"
                onClick={handleFinalize}
                disabled={saveState === "saving"}
              >
                <Check className="h-4 w-4" />
                確定
              </Button>
            </>
          ) : (
            <>
              <Button className="min-h-11 gap-2" onClick={handlePrint}>
                <Printer className="h-4 w-4" />
                印刷
              </Button>
              <Button className="min-h-11" variant="outline" onClick={handlePdf}>
                PDF保存
              </Button>
              <Button className="min-h-11 gap-2" variant="outline" onClick={handleBackToEdit}>
                <Edit3 className="h-4 w-4" />
                文言を編集
              </Button>
            </>
          )}
          <Button className="min-h-11" variant="ghost" asChild>
            <Link to={`/sessions/${sessionId}`}>結果に戻る</Link>
          </Button>
        </div>
        {saveState === "saving" && <InlineLoading message="保存中..." />}
        {saveState === "saved" && (
          <p className="font-ja text-sm text-green-700">下書きを保存しました</p>
        )}
        {saveState === "error" && (
          <p className="font-ja text-sm text-red-600">{saveError || "保存に失敗しました"}</p>
        )}
      </div>

      <SyncPreviewSplit
        storageKey="print-student"
        defaultRatio={0.5}
        className="min-h-0 flex-1"
        previewScrollRef={previewScrollRef}
        left={editPane}
        right={previewPane}
      />
    </div>
  );
}
