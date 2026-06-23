import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Check, Printer, Sparkles } from "lucide-react";
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
import { CollapsiblePanel } from "@/components/layout/CollapsiblePanel";
import { SyncPreviewSplit } from "@/components/layout/SyncPreviewSplit";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { PrintLayoutSettingsPanel } from "@/components/print/PrintLayoutSettingsPanel";
import { PrintPreviewPane } from "@/components/print/PrintPreviewPane";
import {
  DEFAULT_ANSWER_KEY_PRINT_SECTIONS,
  TeacherAnswerKeyPrintLayout,
  type AnswerKeyPrintSections,
} from "@/components/print/TeacherAnswerKeyPrintLayout";
import { Button } from "@/components/ui/button";
import {
  questionAnchor,
  questionPassageAnchor,
  questionUnitAnchor,
} from "@/lib/preview-anchor";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { usePrintLayoutSettings } from "@/hooks/usePrintLayoutSettings";
import { usePrintShortcut } from "@/hooks/usePrintShortcut";
import { apiClient } from "@/lib/api-client";
import { getDb } from "@/lib/firebase";
import { unitHeading } from "@/lib/model-answer-sections";
import {
  applyAnswerKeyUnitsToQuestions,
  buildAnswerKeyUnitsFromDraft,
  initAnswerKeyDraftState,
  type AnswerKeyDraftState,
} from "@/lib/test-answer-key";
import { exportElementToPdf, printElement } from "@/lib/pdf-export";
import type { Question, Test } from "@/types/firestore";

type SaveState = "idle" | "saving" | "saved" | "error";
type GenerateState = "idle" | "generating" | "error";

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
    { key: "passageTranslation", label: "本文の全訳" },
    { key: "prompt", label: "問題文（参考）" },
  ];

  return (
    <CollapsiblePanel
      storageKey="answer-key-sections"
      title="印刷に含める項目"
      description="英語長文がある設問では、本文の全訳を後から手動で生成・編集できます（第2問(A)(B)・第3問は対象外）。"
      defaultOpen={false}
    >
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
    </CollapsiblePanel>
  );
}

export function PrintTestAnswerKeyPage() {
  const { testId } = useParams<{ testId: string }>();
  const { getIdToken } = useAuth();
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draft, setDraft] = useState<AnswerKeyDraftState>({
    bodyByKey: {},
    passageByQuestion: {},
  });
  const [savedDraft, setSavedDraft] = useState<AnswerKeyDraftState>({
    bodyByKey: {},
    passageByQuestion: {},
  });
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<AnswerKeyPrintSections>(
    DEFAULT_ANSWER_KEY_PRINT_SECTIONS,
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [generateState, setGenerateState] = useState<GenerateState>("idle");
  const [generateError, setGenerateError] = useState("");
  const [generatingQuestionIds, setGeneratingQuestionIds] = useState<string[]>([]);

  const layoutKey = testId ? `${testId}-answer-key` : "answer-key";
  const { settings, setSettings, reset } = usePrintLayoutSettings(layoutKey);
  const printRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  usePrintShortcut(printRef);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const applyGeneratedTranslations = useCallback(
    (translations: Record<string, string>) => {
      if (Object.keys(translations).length === 0) return;
      setDraft((prev) => ({
        ...prev,
        passageByQuestion: { ...prev.passageByQuestion, ...translations },
      }));
      setSaveState("idle");
    },
    [],
  );

  const runPassageTranslation = useCallback(
    async (questionIds?: string[], force = false) => {
      if (!testId) return;
      const token = await getIdToken();
      if (!token) {
        setGenerateError("ログインが必要です");
        setGenerateState("error");
        return;
      }

      setGenerateState("generating");
      setGenerateError("");
      setGeneratingQuestionIds(questionIds ?? []);

      try {
        const result = await apiClient.generatePassageTranslations(token, testId, {
          questionIds,
          force,
        });
        applyGeneratedTranslations(result.translations);

        const errorMessages = Object.values(result.errors);
        if (errorMessages.length > 0) {
          setGenerateError(errorMessages.join(" / "));
          setGenerateState("error");
        } else {
          setGenerateState("idle");
        }
      } catch (e) {
        setGenerateState("error");
        setGenerateError(e instanceof Error ? e.message : "全訳の生成に失敗しました");
      } finally {
        setGeneratingQuestionIds([]);
      }
    },
    [applyGeneratedTranslations, getIdToken, testId],
  );

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
      const initial = initAnswerKeyDraftState(loaded);
      setDraft(initial);
      setSavedDraft(initial);
      setLoading(false);
    })();
  }, [testId]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedDraft),
    [draft, savedDraft],
  );

  const draftUnits = useMemo(
    () => buildAnswerKeyUnitsFromDraft(questions, draft),
    [questions, draft],
  );

  const previewQuestions = useMemo(
    () => applyAnswerKeyUnitsToQuestions(questions, draftUnits),
    [questions, draftUnits],
  );

  const updateBody = (key: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      bodyByKey: { ...prev.bodyByKey, [key]: value },
    }));
    setSaveState("idle");
  };

  const updatePassage = (questionId: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      passageByQuestion: { ...prev.passageByQuestion, [questionId]: value },
    }));
    setSaveState("idle");
  };

  const handleSave = async () => {
    if (!testId) return;
    setSaveState("saving");
    setSaveError("");
    try {
      const units = buildAnswerKeyUnitsFromDraft(questions, draft);
      const nextQuestions = applyAnswerKeyUnitsToQuestions(questions, units);
      const batch = writeBatch(getDb());
      for (const q of nextQuestions) {
        const patch: Record<string, unknown> = {};
        if (q.answerParts?.length) {
          patch.answerParts = q.answerParts;
        } else {
          patch.modelAnswer = q.modelAnswer;
        }
        batch.update(doc(getDb(), "tests", testId, "questions", q.id), patch);
      }
      batch.update(doc(getDb(), "tests", testId), {
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setQuestions(nextQuestions);
      const nextDraft = initAnswerKeyDraftState(nextQuestions);
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
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

  const editPane = (
    <div className="no-print space-y-4 p-4 pb-12 sm:p-6">
      <CollapsiblePanel
        storageKey="answer-key-guide"
        title="本文の全訳について"
        defaultOpen={false}
      >
        <p className="font-ja text-sm leading-relaxed text-slate-700">
          英語長文がある設問（長文読解・要約・誤り指摘など）では、本文の全訳をこの画面から手動でAI生成できます。
          問題セット内の第何問か・大学別の大問番号とは一致しなくても、問題の種類に応じて判定します。
        </p>
      </CollapsiblePanel>

      <AnswerKeySectionsPanel sections={sections} onChange={setSections} />

      <PrintLayoutSettingsPanel
        documentLabel="解答・解説・全訳"
        settings={settings}
        onChange={setSettings}
        onReset={reset}
        questionOrders={questions.map((q) => q.order)}
      />

      {questions.map((q, qi) => {
        const qUnits = draftUnits.filter((u) => u.questionId === q.id);
        const passage = draft.passageByQuestion[q.id] ?? "";

        return (
          <CollapsiblePanel
            key={q.id}
            storageKey={`answer-key-q-${q.id}`}
            title={`第${q.order}問`}
            defaultOpen={qi === 0}
          >
            <div className="space-y-5" data-preview-anchor={questionAnchor(q.id)}>
            {qUnits.map((unit) => (
              <div key={unit.key} className="space-y-2">
                {qUnits.length > 1 ? (
                  <h3 className="font-ja text-sm font-semibold text-slate-700">
                    {unitHeading(unit.order, unit.partLabel)}
                  </h3>
                ) : null}
                <label className="font-ja text-sm font-medium text-slate-700">
                  解答・解説
                  {qUnits.length > 1 ? `（${unit.partLabel ?? ""}）` : ""}
                </label>
                <Textarea
                  value={draft.bodyByKey[unit.key] ?? ""}
                  onChange={(e) => updateBody(unit.key, e.target.value)}
                  className="min-h-[180px] font-ja text-base leading-relaxed"
                  rows={10}
                  data-preview-anchor={questionUnitAnchor(q.id, unit.key)}
                />
              </div>
            ))}

            <Card className="space-y-3 border-2 border-slate-200 bg-slate-50/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="font-ja text-sm font-semibold text-slate-800">
                    本文の全訳
                  </label>
                  <p className="mt-1 font-ja text-xs text-slate-500">
                    第{q.order}問のいちばん最後に印刷される別枠です。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 gap-2"
                  disabled={generateState === "generating"}
                  onClick={() => void runPassageTranslation([q.id], Boolean(passage.trim()))}
                >
                  <Sparkles className="h-4 w-4" />
                  {generatingQuestionIds.includes(q.id)
                    ? "生成中…"
                    : passage.trim()
                      ? "AIで全訳を再生成"
                      : "AIで全訳を生成"}
                </Button>
              </div>
              <Textarea
                value={passage}
                onChange={(e) => updatePassage(q.id, e.target.value)}
                className="min-h-[200px] border-slate-200 bg-white font-ja text-base leading-relaxed"
                rows={12}
                placeholder={
                  generatingQuestionIds.includes(q.id)
                    ? "AIが本文の全訳を生成しています…"
                    : "「AIで全訳を生成」ボタンで作成できます（手入力も可）"
                }
                readOnly={generatingQuestionIds.includes(q.id)}
                data-preview-anchor={questionPassageAnchor(q.id)}
              />
            </Card>
            </div>
          </CollapsiblePanel>
        );
      })}
    </div>
  );

  const previewPane = (
    <PrintPreviewPane
      title="印刷プレビュー"
      hint="編集内容が即時反映されます"
      printRef={printRef}
      scrollRef={previewScrollRef}
    >
      <TeacherAnswerKeyPrintLayout
        testTitle={test.title}
        questions={previewQuestions}
        units={draftUnits}
        settings={settings}
        sections={sections}
        passageTranslations={draft.passageByQuestion}
      />
    </PrintPreviewPane>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
      <PageHeader
        title="解答・解説・全訳"
        description={`${test.title} — 左で編集、右で印刷プレビュー（境界をドラッグで幅を調整）`}
      />

      <div className="no-print space-y-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className="min-h-11 gap-2"
            disabled={!isDirty || saveState === "saving"}
            onClick={() => void handleSave()}
          >
            <Check className="h-4 w-4" />
            保存
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            onClick={() => printRef.current && printElement(printRef.current)}
          >
            <Printer className="h-4 w-4" />
            印刷 / PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
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

          <span className="font-ja text-sm">
            {saveState === "saving" && <InlineLoading message="保存中..." />}
            {saveState === "saved" && <span className="text-green-700">保存しました</span>}
            {saveState === "error" && <span className="text-red-600">{saveError}</span>}
            {saveState === "idle" && isDirty && (
              <span className="text-amber-700">未保存の変更があります</span>
            )}
          </span>
        </div>

        {generateState === "generating" && (
          <InlineLoading message="本文の全訳をAIが生成しています…" />
        )}
        {generateState === "error" && generateError && (
          <p className="font-ja text-sm text-red-600">{generateError}</p>
        )}
      </div>

      <SyncPreviewSplit
        storageKey="answer-key"
        defaultRatio={0.5}
        className="min-h-0 flex-1"
        previewScrollRef={previewScrollRef}
        left={editPane}
        right={previewPane}
      />
    </div>
  );
}
