import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Edit3, Printer, RefreshCw } from "lucide-react";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { SyncPreviewSplit } from "@/components/layout/SyncPreviewSplit";
import { PrintPreviewPane } from "@/components/print/PrintPreviewPane";
import { PastExamAdviceEditor } from "@/components/sessions/PastExamAdviceEditor";
import { PastExamAdvicePrintControlsPanel } from "@/components/sessions/PastExamAdvicePrintControlsPanel";
import { PastExamAdvicePrintLayout } from "@/components/sessions/PastExamAdvicePrintLayout";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { usePastExamAdvicePrintPreferences } from "@/hooks/usePastExamAdvicePrintPreferences";
import { useSession, useSessionsForStudent } from "@/hooks/useSession";
import { apiClient } from "@/lib/api-client";
import { exportElementToPdf, printElement } from "@/lib/pdf-export";
import { getDb } from "@/lib/firebase";
import { dedupeSessionsByTest } from "@/lib/session-list";
import type { Student } from "@/types/firestore";
import type { SessionPastExamAdvice } from "@/types/past-exam-advice";

interface PastExamAdvicePanelProps {
  sessionId: string;
  initialAdvice?: SessionPastExamAdvice | null;
}

export function PastExamAdvicePanel({ sessionId, initialAdvice }: PastExamAdvicePanelProps) {
  const { getIdToken } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const { session } = useSession(sessionId);
  const studentSessions = useSessionsForStudent(session?.studentId);
  const [studentName, setStudentName] = useState("");

  const {
    prefs,
    setSections,
    setLayout,
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

  const sessionNumber = useMemo(() => {
    const idx = studentSessions.findIndex((s) => s.id === sessionId);
    return idx >= 0 ? idx + 1 : undefined;
  }, [studentSessions, sessionId]);

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
            総評・受験準備度・アドバイスカード（2〜3枚）を短くまとめた資料です。設問別の解説は添削結果に任せ、ここでは過去問視点の全体アドバイスのみ印刷します。
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
        <div className="no-print lg:min-h-[calc(100dvh-14rem)] lg:overflow-hidden">
          {editMode && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                className="min-h-11"
                variant="outline"
                onClick={() => void handleSave()}
                disabled={saveState === "saving" || !isDirty}
              >
                修正を保存
              </Button>
              {saveState === "saving" && <InlineLoading message="保存中..." />}
              {saveState === "saved" && (
                <span className="font-ja text-sm text-green-700">保存しました</span>
              )}
              {saveState === "error" && (
                <span className="font-ja text-sm text-red-600">
                  {saveError || "保存に失敗しました"}
                </span>
              )}
            </div>
          )}

          <SyncPreviewSplit
            storageKey="past-exam-advice"
            defaultRatio={0.5}
            className="min-h-[32rem] lg:min-h-0 lg:flex-1"
            previewScrollRef={previewScrollRef}
            left={
              <div className="space-y-4 p-4 pb-8">
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
                {editMode ? (
                  <>
                    <Card className="border-blue-100 bg-blue-50/40 p-4">
                      <p className="font-ja text-sm leading-relaxed text-slate-700">
                        総評・各大問の解説・面談要点などを<strong>直接編集</strong>できます。右のプレビューに反映されます。
                      </p>
                    </Card>
                    <PastExamAdviceEditor advice={advice} onChange={setAdvice} />
                  </>
                ) : (
                  <Card className="border-slate-200 bg-slate-50 p-4">
                    <p className="font-ja text-sm leading-relaxed text-slate-700">
                      プレビュー専用モードです。「文言を編集」で左ペインの編集欄を表示できます。
                    </p>
                  </Card>
                )}
              </div>
            }
            right={
              <PrintPreviewPane
                title="印刷プレビュー"
                hint="チェックした項目のみ印刷・PDFに含まれます"
                printRef={printRef}
                scrollRef={previewScrollRef}
              >
                <PastExamAdvicePrintLayout
                  advice={advice}
                  studentName={studentName}
                  sessionNumber={sessionNumber}
                  sections={prefs.sections}
                  layout={prefs.layout}
                  includedQuestions={prefs.includedQuestions}
                />
              </PrintPreviewPane>
            }
          />
        </div>
      )}
    </div>
  );
}
