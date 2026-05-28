import { useEffect, useRef, useState } from "react";
import { Archive, Edit3, Printer, RefreshCw } from "lucide-react";
import { PastExamAdviceEditor } from "@/components/sessions/PastExamAdviceEditor";
import { PastExamAdvicePrintControlsPanel } from "@/components/sessions/PastExamAdvicePrintControlsPanel";
import { PastExamAdvicePrintLayout } from "@/components/sessions/PastExamAdvicePrintLayout";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { usePastExamAdvicePrintPreferences } from "@/hooks/usePastExamAdvicePrintPreferences";
import { apiClient } from "@/lib/api-client";
import { exportElementToPdf, printElement } from "@/lib/pdf-export";
import { getDb } from "@/lib/firebase";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import type { SessionPastExamAdvice } from "@/types/past-exam-advice";

interface PastExamAdvicePanelProps {
  sessionId: string;
  initialAdvice?: SessionPastExamAdvice | null;
}

export function PastExamAdvicePanel({ sessionId, initialAdvice }: PastExamAdvicePanelProps) {
  const { getIdToken } = useAuth();
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
  } = usePastExamAdvicePrintPreferences();

  const [advice, setAdvice] = useState<SessionPastExamAdvice | null>(initialAdvice ?? null);
  const [savedAdvice, setSavedAdvice] = useState<SessionPastExamAdvice | null>(initialAdvice ?? null);
  const [generating, setGenerating] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(true);

  useEffect(() => {
    if (initialAdvice) {
      setAdvice(initialAdvice);
      setSavedAdvice(initialAdvice);
    }
  }, [initialAdvice]);

  const isDirty =
    advice != null && savedAdvice != null && JSON.stringify(advice) !== JSON.stringify(savedAdvice);

  const generate = async () => {
    setGenerating(true);
    setGenerateError(null);
    const token = await getIdToken();
    if (!token) {
      setGenerateError("ログインが必要です");
      setGenerating(false);
      return;
    }
    try {
      const res = await apiClient.generatePastExamAdvice(token, sessionId);
      setAdvice(res.advice);
      setSavedAdvice(res.advice);
      setEditMode(true);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "アドバイスの生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

  const persistAdvice = async () => {
    if (!advice) return;
    await updateDoc(doc(getDb(), "sessions", sessionId), {
      pastExamAdvice: advice,
      updatedAt: serverTimestamp(),
    });
    setSavedAdvice(advice);
  };

  const handleSave = async () => {
    setSaveState("saving");
    setSaveError(null);
    try {
      await persistAdvice();
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "保存に失敗しました");
    }
  };

  const handlePrint = () => {
    if (printRef.current) printElement(printRef.current);
  };

  const handlePdf = async () => {
    if (!printRef.current || !advice) return;
    if (isDirty) await persistAdvice();
    await exportElementToPdf(printRef.current, `past-exam-advice-${sessionId}.pdf`);
  };

  return (
    <div className="space-y-4">
      <LoadingOverlay visible={generating} message="考えてます" />

      <Card className="border-blue-100 bg-blue-50/30 no-print">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-ja text-lg">
            <Archive className="h-5 w-5 text-blue-800" />
            過去問視点のアドバイス
          </CardTitle>
          <CardDescription className="font-ja leading-relaxed">
            添削結果を過去問の出題系統と結びつけたアドバイスです。文言の修正・掲載項目の選択のあと、印刷できます。
          </CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-2 px-6 pb-6">
          <Button className="min-h-11 gap-2" onClick={() => void generate()} disabled={generating}>
            <RefreshCw className="h-4 w-4" />
            {advice ? "再生成する" : "アドバイスを生成"}
          </Button>
          {advice && (
            <>
              <Button className="min-h-11 gap-2" onClick={handlePrint}>
                <Printer className="h-4 w-4" />
                印刷
              </Button>
              <Button className="min-h-11" variant="outline" onClick={() => void handlePdf()}>
                PDF保存
              </Button>
              <Button
                className="min-h-11 gap-2"
                variant="outline"
                onClick={() => setEditMode((v) => !v)}
              >
                <Edit3 className="h-4 w-4" />
                {editMode ? "プレビューのみ" : "文言を編集"}
              </Button>
            </>
          )}
        </div>
        {generateError && <p className="px-6 pb-4 font-ja text-sm text-red-700">{generateError}</p>}
      </Card>

      {advice && (
        <>
          <PastExamAdvicePrintControlsPanel
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

          {editMode && (
            <>
              <Card className="no-print border-blue-100 bg-blue-50/40 p-4">
                <p className="font-ja text-sm leading-relaxed text-slate-700">
                  総評・各大問の解説・面談要点などを<strong>直接編集</strong>できます。下のプレビューに反映されます。
                </p>
              </Card>
              <div className="no-print flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  variant="outline"
                  onClick={() => void handleSave()}
                  disabled={saveState === "saving" || !isDirty}
                >
                  修正を保存
                </Button>
              </div>
              {saveState === "saving" && <InlineLoading message="保存中..." />}
              {saveState === "saved" && (
                <p className="no-print font-ja text-sm text-green-700">保存しました</p>
              )}
              {saveState === "error" && (
                <p className="no-print font-ja text-sm text-red-600">
                  {saveError || "保存に失敗しました"}
                </p>
              )}
              <PastExamAdviceEditor
                advice={advice}
                includedQuestions={prefs.includedQuestions}
                onIncludedChange={setQuestionIncluded}
                onChange={setAdvice}
              />
            </>
          )}

          <p className="no-print font-ja text-sm text-slate-500">
            下のプレビューが印刷・PDFの内容です（チェックした項目のみ）。
          </p>

          <div ref={printRef} className="bg-slate-100 p-8 print:bg-white print:p-0">
            <PastExamAdvicePrintLayout
              advice={advice}
              sections={prefs.sections}
              layout={prefs.layout}
              includedQuestions={prefs.includedQuestions}
            />
          </div>
        </>
      )}
    </div>
  );
}
