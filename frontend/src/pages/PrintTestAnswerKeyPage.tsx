import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Edit3, Printer } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { PageHeader } from "@/components/layout/AppShell";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { PrintLayoutSettingsPanel } from "@/components/print/PrintLayoutSettingsPanel";
import {
  DEFAULT_ANSWER_KEY_PRINT_SECTIONS,
  TeacherAnswerKeyPrintLayout,
  type AnswerKeyPrintSections,
} from "@/components/print/TeacherAnswerKeyPrintLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { usePrintLayoutSettings } from "@/hooks/usePrintLayoutSettings";
import { usePrintShortcut } from "@/hooks/usePrintShortcut";
import { getDb } from "@/lib/firebase";
import { unitHeading } from "@/lib/model-answer-sections";
import {
  applyAnswerKeyUnitsToQuestions,
  expandAnswerKeyUnits,
  type AnswerKeyUnit,
} from "@/lib/test-answer-key";
import { exportElementToPdf, printElement } from "@/lib/pdf-export";
import type { Question, Test } from "@/types/firestore";

type PrintMode = "edit" | "preview";
type SaveState = "idle" | "saving" | "saved" | "error";

function AnswerKeySectionsPanel({
  sections,
  onChange,
}: {
  sections: AnswerKeyPrintSections;
  onChange: (next: AnswerKeyPrintSections) => void;
}) {
  const items: { key: keyof AnswerKeyPrintSections; label: string }[] = [
    { key: "body", label: "解答・解説" },
    { key: "vocabulary", label: "重要語句" },
    { key: "translation", label: "全訳" },
    { key: "prompt", label: "問題文（参考）" },
  ];

  return (
    <Card className="space-y-3 p-4">
      <p className="font-ja text-sm font-semibold text-slate-800">印刷に含める項目</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {items.map(({ key, label }) => (
          <label key={key} className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-ja text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={sections[key]}
              onChange={(e) => onChange({ ...sections, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
    </Card>
  );
}

export function PrintTestAnswerKeyPage() {
  const { testId } = useParams<{ testId: string }>();
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draftUnits, setDraftUnits] = useState<AnswerKeyUnit[]>([]);
  const [savedUnits, setSavedUnits] = useState<AnswerKeyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PrintMode>("edit");
  const [sections, setSections] = useState<AnswerKeyPrintSections>(
    DEFAULT_ANSWER_KEY_PRINT_SECTIONS,
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");

  const layoutKey = testId ? `${testId}-answer-key` : "answer-key";
  const { settings, setSettings, reset } = usePrintLayoutSettings(layoutKey);
  const printRef = useRef<HTMLDivElement>(null);
  usePrintShortcut(printRef);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (!testId) return;
    (async () => {
      const testSnap = await getDoc(doc(getDb(), "tests", testId));
      if (!testSnap.exists()) {
        setLoading(false);
        return;
      }
      setTest({ id: testSnap.id, ...testSnap.data() } as Test);

      const qSnap = await getDocs(
        query(collection(getDb(), "tests", testId, "questions"), orderBy("order")),
      );
      const loaded = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Question);
      setQuestions(loaded);
      const units = expandAnswerKeyUnits(loaded);
      setDraftUnits(units);
      setSavedUnits(units);
      setLoading(false);
    })();
  }, [testId]);

  const isDirty = useMemo(
    () => JSON.stringify(draftUnits) !== JSON.stringify(savedUnits),
    [draftUnits, savedUnits],
  );

  const previewQuestions = useMemo(
    () => applyAnswerKeyUnitsToQuestions(questions, draftUnits),
    [questions, draftUnits],
  );

  const previewUnits = useMemo(
    () => expandAnswerKeyUnits(previewQuestions),
    [previewQuestions],
  );

  const updateUnit = (key: string, modelAnswer: string) => {
    setDraftUnits((prev) => prev.map((u) => (u.key === key ? { ...u, modelAnswer } : u)));
    setSaveState("idle");
  };

  const handleSave = async () => {
    if (!testId) return;
    setSaveState("saving");
    setSaveError("");
    try {
      const nextQuestions = applyAnswerKeyUnitsToQuestions(questions, draftUnits);
      const batch = writeBatch(getDb());
      for (const q of nextQuestions) {
        const { id, ...rest } = q;
        const patch: Record<string, unknown> = {};
        if (q.answerParts?.length) {
          patch.answerParts = q.answerParts;
        } else {
          patch.modelAnswer = q.modelAnswer;
        }
        batch.update(doc(getDb(), "tests", testId, "questions", id), patch);
      }
      batch.update(doc(getDb(), "tests", testId), {
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setQuestions(nextQuestions);
      const units = expandAnswerKeyUnits(nextQuestions);
      setDraftUnits(units);
      setSavedUnits(units);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  if (loading) {
    return <div className="page-content font-ja text-slate-500">読み込み中...</div>;
  }

  if (!test || questions.length === 0) {
    return (
      <div className="space-y-4 p-8 font-ja">
        <p>解答・解説・全訳を表示できません。設問と模範解答を登録してください。</p>
        <Button asChild variant="outline">
          <Link to={`/tests/${testId}`}>問題エディタに戻る</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="解答・解説・全訳（教師用）"
        description={`${test.title} — 模範解答の確認・修正・印刷`}
      />

      <div className="no-print space-y-4 p-8 pb-0">
        <Card className="border-blue-100 bg-blue-50/80 p-4 font-ja text-sm leading-relaxed text-slate-700">
          <p>
            問題生成で登録した模範解答・解説・全訳（【全訳】など）をここで一覧できます。
            編集モードで文言を直し、保存してから印刷してください。生徒への配布は問題用紙のみを想定しています。
          </p>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "edit" ? "default" : "outline"}
            className="min-h-11 gap-2"
            onClick={() => setMode("edit")}
          >
            <Edit3 className="h-4 w-4" />
            編集
          </Button>
          <Button
            type="button"
            variant={mode === "preview" ? "default" : "outline"}
            className="min-h-11 gap-2"
            onClick={() => setMode("preview")}
          >
            <Printer className="h-4 w-4" />
            印刷プレビュー
          </Button>
          <Button
            type="button"
            className="min-h-11 gap-2"
            disabled={mode !== "preview"}
            onClick={() => printRef.current && printElement(printRef.current)}
          >
            印刷 / PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={mode !== "preview"}
            onClick={() =>
              printRef.current &&
              exportElementToPdf(printRef.current, `${test.title}-解答解説`)
            }
          >
            PDF 保存
          </Button>
          <Button variant="outline" className="min-h-11" asChild>
            <Link to={`/tests/${testId}/print/test-paper`}>問題用紙を印刷</Link>
          </Button>
          <Button variant="outline" className="min-h-11" asChild>
            <Link to={`/tests/${testId}`}>問題エディタ</Link>
          </Button>
        </div>

        {mode === "edit" && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="min-h-11 gap-2"
              disabled={!isDirty || saveState === "saving"}
              onClick={() => void handleSave()}
            >
              <Check className="h-4 w-4" />
              保存
            </Button>
            {saveState === "saving" && <InlineLoading message="保存中..." />}
            {saveState === "saved" && (
              <span className="font-ja text-sm text-green-700">保存しました</span>
            )}
            {saveState === "error" && (
              <span className="font-ja text-sm text-red-600">{saveError}</span>
            )}
            {saveState === "idle" && isDirty && (
              <span className="font-ja text-sm text-amber-700">未保存の変更があります</span>
            )}
          </div>
        )}

        <AnswerKeySectionsPanel sections={sections} onChange={setSections} />

        <PrintLayoutSettingsPanel
          documentLabel="解答・解説・全訳"
          settings={settings}
          onChange={setSettings}
          onReset={reset}
        />
      </div>

      {mode === "edit" ? (
        <div className="page-content mx-auto max-w-4xl space-y-6 pb-12">
          {draftUnits.map((unit) => (
            <Card key={unit.key} className="space-y-3 p-5">
              <h2 className="font-ja text-lg font-semibold text-slate-900">
                {unitHeading(unit.order, unit.partLabel)}
              </h2>
              <p className="font-ja text-xs text-slate-500">
                解答・解説・【重要語句】・【全訳】をこの欄にまとめて入力できます（問題生成の形式のまま編集可）。
              </p>
              <Textarea
                value={unit.modelAnswer}
                onChange={(e) => updateUnit(unit.key, e.target.value)}
                className="min-h-[220px] font-ja text-base leading-relaxed"
                rows={12}
              />
            </Card>
          ))}
        </div>
      ) : (
        <div ref={printRef} className="bg-slate-100 p-8 print:bg-white print:p-0">
          <TeacherAnswerKeyPrintLayout
            testTitle={test.title}
            questions={previewQuestions}
            units={previewUnits}
            settings={settings}
            sections={sections}
          />
        </div>
      )}
    </div>
  );
}
