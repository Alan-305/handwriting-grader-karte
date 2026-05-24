import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import { sumResultScores, toScoreOutOf100 } from "@/lib/scoring";
import type { GradeLevel, QuestionResult } from "@/types/firestore";

type PrintMode = "edit" | "preview";

const GRADES: GradeLevel[] = ["優", "良", "不可"];

function resultLabel(r: QuestionResult): string {
  return r.partLabel ? `第${r.order}問 ${r.partLabel}` : `第${r.order}問`;
}

export function PrintStudentPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, results, loading } = useSession(sessionId);
  const { saveResults, setPrintFinalized, syncSessionScores } = useUpdateQuestionResults(sessionId);
  const { saveArtifact } = useSavePrintArtifact(sessionId ?? "");
  const printRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<PrintMode>("edit");
  const [drafts, setDrafts] = useState<QuestionResult[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    setDrafts(results);
  }, [results]);

  useEffect(() => {
    if (session?.studentPrintFinalizedAt) {
      setMode("preview");
    }
  }, [session?.studentPrintFinalizedAt]);

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

  const handleSaveDraft = async () => {
    setSaveState("saving");
    try {
      await saveResults(
        drafts.map(({ id, studentAnswerText, explanation, modelAnswer, grade, score, feedback }) => ({
          id,
          studentAnswerText,
          explanation,
          modelAnswer,
          grade,
          score,
          feedback,
        })),
      );
      await syncSessionScores(drafts);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  };

  const handleFinalize = async () => {
    setSaveState("saving");
    try {
      await saveResults(
        drafts.map(({ id, studentAnswerText, explanation, modelAnswer, grade, score, feedback }) => ({
          id,
          studentAnswerText,
          explanation,
          modelAnswer,
          grade,
          score,
          feedback,
        })),
      );
      await syncSessionScores(drafts);
      await setPrintFinalized(true);
      setMode("preview");
      setSaveState("idle");
    } catch {
      setSaveState("error");
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
        grade: r.grade,
        explanation: r.explanation,
        modelAnswer: r.modelAnswer,
      })),
    });
  };

  const activeResults = drafts.length ? drafts : results;
  const { totalScore, maxScore } = sumResultScores(activeResults);
  const totalScore100 = session
    ? (mode === "preview" && session.totalScore100 != null
        ? session.totalScore100
        : toScoreOutOf100(totalScore, maxScore))
    : 0;

  if (loading) return <div className="p-8 font-ja">読み込み中...</div>;

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

      <div className="no-print space-y-4 p-8">
        {mode === "edit" ? (
          <>
            <Card className="border-blue-100 bg-blue-50/40 p-4">
              <p className="font-ja text-sm leading-relaxed text-slate-700">
                解説・解答の書き起こし・模範解答などを編集できます。
                内容を確認したら<strong>「確定して印刷プレビュー」</strong>を押してください。確定後に印刷します。
              </p>
            </Card>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={handleSaveDraft} disabled={saveState === "saving" || !isDirty}>
                下書きを保存
              </Button>
              <Button className="gap-2" onClick={handleFinalize} disabled={saveState === "saving"}>
                <Check className="h-4 w-4" />
                確定して印刷プレビュー
              </Button>
              <Button variant="ghost" asChild>
                <Link to={`/sessions/${sessionId}`}>結果に戻る</Link>
              </Button>
            </div>
            {saveState === "saving" && <InlineLoading message="保存中..." />}
            {saveState === "saved" && (
              <p className="font-ja text-sm text-green-700">下書きを保存しました</p>
            )}
            {saveState === "error" && (
              <p className="font-ja text-sm text-red-600">保存に失敗しました</p>
            )}

            <div className="space-y-4">
              {drafts.map((r) => (
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
                    </div>
                  </div>
                  <div>
                    <label className="font-ja text-sm">あなたの解答（書き起こし）</label>
                    <Textarea
                      className="font-en mt-1"
                      rows={2}
                      value={r.studentAnswerText ?? ""}
                      onChange={(e) => updateDraft(r.id, { studentAnswerText: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="font-ja text-sm">解説</label>
                    <Textarea
                      className="mt-1 font-ja"
                      rows={4}
                      value={r.explanation}
                      onChange={(e) => updateDraft(r.id, { explanation: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="font-ja text-sm">模範解答（プリント掲載）</label>
                    <Textarea
                      className="font-en mt-1"
                      rows={2}
                      value={r.modelAnswer}
                      onChange={(e) => updateDraft(r.id, { modelAnswer: e.target.value })}
                    />
                  </div>
                </Card>
              ))}
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
            results={drafts.length ? drafts : results}
            totalScore100={totalScore100}
          />
        </div>
      )}
    </div>
  );
}
