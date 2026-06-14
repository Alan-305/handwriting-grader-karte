import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Edit3, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { SyncPreviewSplit } from "@/components/layout/SyncPreviewSplit";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { GradingPrintControlsPanel } from "@/components/print/GradingPrintControlsPanel";
import { GradingPrintQuestionEditor } from "@/components/print/GradingPrintQuestionEditor";
import { PrintPreviewPane } from "@/components/print/PrintPreviewPane";
import { TeacherPrintLayout } from "@/components/print/PrintLayouts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useGradingPrintPreferences } from "@/hooks/useGradingPrintPreferences";
import { usePrintShortcut } from "@/hooks/usePrintShortcut";
import { useSavePrintArtifact, useSession, useUpdateQuestionResults } from "@/hooks/useSession";
import { apiClient } from "@/lib/api-client";
import { isQuestionIncluded } from "@/lib/grading-print-config";
import { exportElementToPdf, printElement } from "@/lib/pdf-export";
import { sortQuestionResults, updateQuestionPassageTranslation } from "@/lib/question-results";
import type { TeacherPrintSections } from "@/lib/grading-print-config";
import type { QuestionResult } from "@/types/firestore";

export function PrintTeacherPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { results, loading } = useSession(sessionId);
  const { saveResults } = useUpdateQuestionResults(sessionId);
  const { saveArtifact } = useSavePrintArtifact(sessionId ?? "");
  const { getIdToken } = useAuth();
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
  } = useGradingPrintPreferences("teacher");

  const [drafts, setDrafts] = useState<QuestionResult[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [editMode, setEditMode] = useState(true);

  useEffect(() => {
    setDrafts(sortQuestionResults(results));
  }, [results]);

  const sortedDrafts = useMemo(() => sortQuestionResults(drafts), [drafts]);
  const activeResults = sortedDrafts.length ? sortedDrafts : sortQuestionResults(results);

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
        feedback: d.feedback,
        contentEvaluation: d.contentEvaluation,
        grammarEvaluation: d.grammarEvaluation,
        polishedAnswer: d.polishedAnswer,
        teacherNotes: d.teacherNotes,
        errorTags: d.errorTags,
      })),
    );
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

  const handlePrint = () => {
    if (printRef.current) printElement(printRef.current);
  };

  const handlePdf = async () => {
    if (!printRef.current) return;
    await exportElementToPdf(printRef.current, `teacher-${sessionId}.pdf`);
  };

  const handleComplete = async () => {
    const token = await getIdToken();
    if (!token || !sessionId) return;
    if (isDirty) await persistDrafts();
    await saveArtifact("teacher", {
      sections: activeResults.map((r) => ({
        questionOrder: r.order,
        studentAnswer: r.studentAnswerText ?? "",
        grade: r.grade ?? "良",
        explanation: r.explanation ?? "",
        modelAnswer: r.modelAnswer,
        teacherNotes: r.teacherNotes,
      })),
    });
    await apiClient.completeSession(token, sessionId);
  };

  if (loading) return <div className="page-content font-ja">読み込み中...</div>;

  const editPane = (
    <div className="space-y-4 p-4 pb-8 sm:p-6">
      <GradingPrintControlsPanel
        kind="teacher"
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

      {editMode ? (
        <>
          <Card className="border-blue-100 bg-blue-50/40 p-4">
            <p className="font-ja text-sm leading-relaxed text-slate-700">
              講評・指導ポイント・解説などを編集できます。右のプレビューに即時反映されます。
            </p>
          </Card>
          <div className="space-y-4">
            {sortedDrafts.map((r, index) => (
              <GradingPrintQuestionEditor
                key={r.id}
                result={r}
                allResults={sortedDrafts}
                kind="teacher"
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
            プレビュー専用モードです。「文言を編集」で左ペインの編集欄を表示できます。
          </p>
        </Card>
      )}
    </div>
  );

  const previewPane = (
    <PrintPreviewPane
      title="印刷プレビュー"
      hint="チェックした項目のみ印刷・PDFに含まれます"
      printRef={printRef}
      scrollRef={previewScrollRef}
    >
      <TeacherPrintLayout
        results={activeResults}
        sections={prefs.sections as TeacherPrintSections}
        layout={prefs.layout}
        includedQuestions={prefs.includedQuestions}
      />
    </PrintPreviewPane>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
      <PageHeader
        title="教師用指導資料"
        description="左で編集、右で印刷プレビュー（それぞれ独立してスクロール）"
      />

      <div className="no-print shrink-0 space-y-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            印刷
          </Button>
          <Button className="min-h-11" variant="outline" onClick={handlePdf}>
            PDF保存
          </Button>
          <Button className="min-h-11" variant="outline" onClick={handleComplete}>
            セッション完了
          </Button>
          <Button
            className="min-h-11 gap-2"
            variant="outline"
            onClick={() => setEditMode((v) => !v)}
          >
            <Edit3 className="h-4 w-4" />
            {editMode ? "プレビューのみ表示" : "文言を編集"}
          </Button>
          {editMode && (
            <Button
              className="min-h-11"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={saveState === "saving" || !isDirty}
            >
              下書きを保存
            </Button>
          )}
          <Button className="min-h-11" variant="ghost" asChild>
            <Link to={`/sessions/${sessionId}`}>結果に戻る</Link>
          </Button>
        </div>
        {saveState === "saving" && <InlineLoading message="保存中..." />}
        {saveState === "saved" && (
          <p className="font-ja text-sm text-green-700">保存しました</p>
        )}
        {saveState === "error" && (
          <p className="font-ja text-sm text-red-600">{saveError || "保存に失敗しました"}</p>
        )}
      </div>

      <SyncPreviewSplit
        storageKey="print-teacher"
        defaultRatio={0.5}
        className="min-h-0 flex-1"
        previewScrollRef={previewScrollRef}
        left={editPane}
        right={previewPane}
      />
    </div>
  );
}
