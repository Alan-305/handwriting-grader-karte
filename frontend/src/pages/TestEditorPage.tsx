import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { Check, FileText, Printer, Save, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { CollapsiblePanel } from "@/components/layout/CollapsiblePanel";
import { PreviewScrollArea } from "@/components/layout/PreviewScrollRegisterContext";
import { SyncPreviewSplit } from "@/components/layout/SyncPreviewSplit";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { ScaledPrintPreview } from "@/components/print/ScaledPrintPreview";
import {
  DEFAULT_ANSWER_KEY_PRINT_SECTIONS,
  TeacherAnswerKeyPrintLayout,
} from "@/components/print/TeacherAnswerKeyPrintLayout";
import { AnswerSheetPrintLayout } from "@/components/print/AnswerSheetPrintLayout";
import { TestPaperPrintLayout } from "@/components/print/TestPaperPrintLayout";
import { CropPreview } from "@/components/upload/CropPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { confirmDeleteTarget } from "@/lib/confirm-delete";
import {
  questionAnchor,
  questionPassageAnchor,
  questionPromptAnchor,
  questionUnitAnchor,
} from "@/lib/preview-anchor";
import { generateAnswerSheetLayout } from "@/lib/answer-sheet-layout";
import {
  addAnswerPart,
  applyLayoutCropRegions,
  expandAnswerUnits,
  relabelAnswerParts,
  removeAnswerPart,
  resolvePartLabelScheme,
  updateAnswerPart,
} from "@/lib/answer-parts";
import {
  DEFAULT_FORMAT,
  DEFAULT_OPTIONS,
  FORMAT_LABEL,
} from "@/lib/answer-format";
import { AnswerPartCard, AnswerPartFormatFields } from "@/components/tests/AnswerPartFormatFields";
import { TestValidityPanel } from "@/components/tests/TestValidityPanel";
import { getDb } from "@/lib/firebase";
import { NO_MODEL_ANSWER_HINT, resolveGradingMode } from "@/lib/grading-mode";
import {
  answerBodyWithoutPassageTranslation,
  splitModelAnswerSections,
  translationBody,
} from "@/lib/model-answer-sections";
import {
  supportsPassageTranslation,
} from "@/lib/passage-translation-policy";
import { QUESTION_TEXT_HINT } from "@/lib/question-text-format";
import {
  expandAnswerKeyUnits,
  mergePassageTranslationsIntoQuestions,
  questionNeedsAiPassageTranslation,
  questionShowsPassageTranslationField,
  stripPassageTranslationsFromQuestions,
} from "@/lib/test-answer-key";
import { usePrintLayoutSettings } from "@/hooks/usePrintLayoutSettings";
import type {
  AnswerSheetTemplate,
  CropRegion,
  PartLabelScheme,
  Question,
  QuestionType,
  Test,
} from "@/types/firestore";

const DEFAULT_REGION: CropRegion = { x: 50, y: 50, width: 400, height: 120 };

type SaveState = "idle" | "saving" | "saved" | "error";

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined)
      .map((v) => stripUndefinedDeep(v)) as T;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefinedDeep(v)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

function questionPatchForFirestore(question: Question): Record<string, unknown> {
  const { id, ...rest } = question;
  return stripUndefinedDeep(rest as Record<string, unknown>);
}

export function TestEditorPage() {
  const { testId } = useParams<{ testId: string }>();
  const { user, getIdToken } = useAuth();
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTemplateId, setDraftTemplateId] = useState("");
  const [draftQuestions, setDraftQuestions] = useState<Question[]>([]);
  const [draftTranslations, setDraftTranslations] = useState<Record<string, string>>({});
  const [savedTranslations, setSavedTranslations] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<AnswerSheetTemplate[]>([]);
  const [selectedQ, setSelectedQ] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<"paper" | "answer_sheet" | "answer_key">("paper");
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [translatingQuestionId, setTranslatingQuestionId] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState("");
  const paperPrintSettings = usePrintLayoutSettings(testId);
  const answerKeyPrintSettings = usePrintLayoutSettings(
    testId ? `${testId}-answer-key` : undefined,
  );

  useEffect(() => {
    if (!testId) return;
    return onSnapshot(doc(getDb(), "tests", testId), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Test;
        setTest(data);
        setDraftTitle(data.title);
        setDraftTemplateId(data.templateId ?? "");
      }
    });
  }, [testId]);

  useEffect(() => {
    if (!testId) return;
    const q = query(collection(getDb(), "tests", testId, "questions"), orderBy("order"));
    return onSnapshot(q, (snap) => {
      const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Question);
      // 模範解答内の【全訳】は編集用に分離し、常に独立した「全訳」欄で扱う
      const { questions: stripped, translations } =
        stripPassageTranslationsFromQuestions(loaded);
      setQuestions(stripped);
      setDraftQuestions(stripped);
      setSavedTranslations(translations);
      setDraftTranslations(translations);
    });
  }, [testId]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(getDb(), "answer_sheet_templates"),
      where("teacherId", "==", user.uid),
    );
    return onSnapshot(q, (snap) => {
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AnswerSheetTemplate));
    });
  }, [user]);

  const isDirty = useMemo(() => {
    if (!test) return false;
    if (draftTitle !== test.title) return true;
    if (draftTemplateId !== (test.templateId ?? "")) return true;
    if (draftQuestions.length !== questions.length) return true;
    if (JSON.stringify(draftTranslations) !== JSON.stringify(savedTranslations)) return true;
    return draftQuestions.some((dq) => {
      const orig = questions.find((q) => q.id === dq.id);
      if (!orig) return true;
      return JSON.stringify(dq) !== JSON.stringify(orig);
    });
  }, [
    test,
    draftTitle,
    draftTemplateId,
    draftQuestions,
    questions,
    draftTranslations,
    savedTranslations,
  ]);

  const updateDraftQuestion = (index: number, patch: Partial<Question>) => {
    setDraftQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
    setSaveState("idle");
  };

  const updateDraftTranslation = (questionId: string, value: string) => {
    setDraftTranslations((prev) => ({ ...prev, [questionId]: value }));
    setSaveState("idle");
  };

  const handleGeneratePassageTranslation = async (questionId: string, force = false) => {
    if (!testId) return;
    setTranslatingQuestionId(questionId);
    setTranslationError("");
    const token = await getIdToken();
    if (!token) {
      setTranslationError("ログインが必要です");
      setTranslatingQuestionId(null);
      return;
    }
    try {
      const result = await apiClient.generatePassageTranslations(token, testId, {
        questionIds: [questionId],
        force,
      });
      const translation = result.translations[questionId];
      if (translation) {
        updateDraftTranslation(questionId, translation);
      }
      const errorMessage = result.errors[questionId];
      if (errorMessage) {
        setTranslationError(errorMessage);
      }
    } catch (err) {
      setTranslationError(
        err instanceof Error ? err.message : "本文全訳の生成に失敗しました",
      );
    } finally {
      setTranslatingQuestionId(null);
    }
  };

  const applyRevision = (questionOrder: number, field: string, value: string) => {
    let nextValue = value;
    if (field === "modelAnswer") {
      // 修正案に【全訳】が含まれる場合も、独立した全訳欄へ振り分ける
      const { translation } = splitModelAnswerSections(value);
      if (translation.trim()) {
        nextValue = answerBodyWithoutPassageTranslation(value);
        const target = draftQuestions.find((q) => q.order === questionOrder);
        if (target) {
          setDraftTranslations((prev) => ({
            ...prev,
            [target.id]: translationBody(translation),
          }));
        }
      }
    }
    setDraftQuestions((prev) =>
      prev.map((q) => {
        if (q.order !== questionOrder) return q;
        if (field === "points") {
          const points = Number(value);
          return Number.isFinite(points) ? { ...q, points } : q;
        }
        if (field === "prompt") return { ...q, prompt: value };
        if (field === "modelAnswer") return { ...q, modelAnswer: nextValue };
        return q;
      }),
    );
    setSaveState("idle");
  };

  /**
   * 保存・プレビュー用に、分離している全訳を modelAnswer へ戻す。
   * 模範解答欄に直接【全訳】と書かれた場合も末尾の全訳へ合流させる。
   */
  const buildQuestionsWithTranslations = useCallback(
    (qs: Question[]): Question[] => {
      const { questions: cleaned, translations: typed } =
        stripPassageTranslationsFromQuestions(qs);
      const merged: Record<string, string> = { ...draftTranslations };
      for (const [qid, t] of Object.entries(typed)) {
        const existing = (merged[qid] ?? "").trim();
        merged[qid] = existing && existing !== t.trim() ? `${existing}\n\n${t}` : t;
      }
      return mergePassageTranslationsIntoQuestions(cleaned, merged);
    },
    [draftTranslations],
  );

  const addQuestion = async () => {
    if (!testId) return;
    const order = draftQuestions.length + 1;
    const type: QuestionType = "english";
    const answerFormat = DEFAULT_FORMAT[type];
    const formatOptions = { ...DEFAULT_OPTIONS[answerFormat] };
    const ref = await addDoc(collection(getDb(), "tests", testId, "questions"), {
      order,
      type,
      answerFormat,
      formatOptions,
      prompt: "",
      modelAnswer: "",
      points: 10,
      cropRegion: { ...DEFAULT_REGION, y: DEFAULT_REGION.y + (order - 1) * 140 },
    });
    const newQ: Question = {
      id: ref.id,
      order,
      type,
      answerFormat,
      formatOptions,
      prompt: "",
      modelAnswer: "",
      points: 10,
      cropRegion: { ...DEFAULT_REGION, y: DEFAULT_REGION.y + (order - 1) * 140 },
    };
    setDraftQuestions((prev) => [...prev, newQ]);
  };

  const removeQuestion = async (index: number) => {
    if (!testId) return;
    const target = draftQuestions[index];
    if (!target) return;
    if (!confirmDeleteTarget(`第${target.order}問`)) return;

    setSaveState("saving");
    setSaveError("");
    try {
      const batch = writeBatch(getDb());
      batch.delete(doc(getDb(), "tests", testId, "questions", target.id));

      const remaining = draftQuestions.filter((_, i) => i !== index);
      const reOrdered = remaining.map((q, i) => {
        const newOrder = i + 1;
        if (q.order === newOrder) return q;
        return {
          ...q,
          order: newOrder,
          cropRegion: {
            ...q.cropRegion,
            y: DEFAULT_REGION.y + (newOrder - 1) * 140,
          },
        };
      });

      for (const q of reOrdered) {
        const { id, ...data } = q;
        batch.update(doc(getDb(), "tests", testId, "questions", id), data);
      }

      const totalPoints = reOrdered.reduce((s, q) => s + q.points, 0);
      batch.update(doc(getDb(), "tests", testId), {
        totalPoints,
        questionCount: reOrdered.length,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      setDraftQuestions(reOrdered);
      setSelectedQ((prev) => Math.max(0, Math.min(prev, reOrdered.length - 1)));
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "設問の削除に失敗しました");
    }
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draftQuestions.length) return;

    setDraftQuestions((prev) => {
      const next = [...prev];
      const [moving] = next.splice(index, 1);
      next.splice(target, 0, moving);

      return next.map((q, i) => ({
        ...q,
        order: i + 1,
        // 画面上のプレビュー位置だけ簡易的に合わせる（実印刷は「解答用紙を自動生成」で再配置される）
        cropRegion: {
          ...q.cropRegion,
          y: DEFAULT_REGION.y + i * 140,
        },
      }));
    });

    setSelectedQ((prev) => {
      if (prev === index) return target;
      if (direction === -1) {
        // index と target の間にいる場合だけ 1つ下へ
        if (prev >= target && prev < index) return prev + 1;
      } else {
        // index と target の間にいる場合だけ 1つ上へ
        if (prev > index && prev <= target) return prev - 1;
      }
      return prev;
    });

    setSaveState("idle");
  };

  const handleSave = async () => {
    if (!testId) return;
    setSaveState("saving");
    setSaveError("");
    try {
      const batch = writeBatch(getDb());
      const questionsToSave = buildQuestionsWithTranslations(draftQuestions);
      const totalPoints = questionsToSave.reduce((s, q) => s + q.points, 0);

      batch.update(doc(getDb(), "tests", testId), {
        title: draftTitle,
        templateId: draftTemplateId,
        totalPoints,
        questionCount: questionsToSave.length,
        updatedAt: serverTimestamp(),
      });

      for (const q of questionsToSave) {
        batch.update(
          doc(getDb(), "tests", testId, "questions", q.id),
          questionPatchForFirestore(q),
        );
      }

      await batch.commit();
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "保存に失敗しました");
    }
  };

  const generateAnswerSheet = async () => {
    if (!testId || !user || draftQuestions.length === 0) return;
    setSaveState("saving");
    setSaveError("");
    try {
      const layout = generateAnswerSheetLayout(draftQuestions, paperPrintSettings.settings);

      const tplRef = await addDoc(collection(getDb(), "answer_sheet_templates"), {
        teacherId: user.uid,
        name: `${draftTitle || "テスト"}-解答用紙`,
        pageWidth: layout.pageWidth,
        pageHeight: layout.pageHeight,
        alignmentMarks: layout.alignmentMarks,
        createdAt: serverTimestamp(),
      });

      const updatedQuestions = applyLayoutCropRegions(draftQuestions, layout.slots);
      setDraftQuestions(updatedQuestions);
      setDraftTemplateId(tplRef.id);

      const batch = writeBatch(getDb());
      const questionsToSave = buildQuestionsWithTranslations(updatedQuestions);
      const totalPoints = questionsToSave.reduce((s, q) => s + q.points, 0);
      batch.update(doc(getDb(), "tests", testId), {
        title: draftTitle,
        templateId: tplRef.id,
        totalPoints,
        questionCount: questionsToSave.length,
        updatedAt: serverTimestamp(),
      });
      for (const q of questionsToSave) {
        batch.update(
          doc(getDb(), "tests", testId, "questions", q.id),
          questionPatchForFirestore(q),
        );
      }
      await batch.commit();

      navigate(`/tests/${testId}/print/answer-sheet`);
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "解答用紙の生成に失敗しました");
    } finally {
      setSaveState("idle");
    }
  };

  const cropTargets = useMemo(
    () =>
      draftQuestions.flatMap((q, questionIndex) =>
        expandAnswerUnits(q).map((unit, partIndex) => ({
          questionIndex,
          partIndex,
          hasParts: (q.answerParts?.length ?? 0) > 0,
          region: unit.cropRegion,
        })),
      ),
    [draftQuestions],
  );

  const regions = cropTargets.map((t) => t.region);

  const previewQuestions = useMemo(
    () => buildQuestionsWithTranslations(draftQuestions),
    [buildQuestionsWithTranslations, draftQuestions],
  );
  const previewUnits = useMemo(
    () => expandAnswerKeyUnits(previewQuestions),
    [previewQuestions],
  );
  const previewTotalPoints = useMemo(
    () => draftQuestions.reduce((s, q) => s + q.points, 0),
    [draftQuestions],
  );
  const answerSheetSlots = useMemo(() => {
    if (draftQuestions.length === 0) return [];
    return generateAnswerSheetLayout(draftQuestions, paperPrintSettings.settings).slots;
  }, [draftQuestions, paperPrintSettings.settings]);

  const editorPane = (
    <div className="space-y-6 p-4 pb-44 sm:p-6 lg:pb-40">
        <CollapsiblePanel
          storageKey="test-editor-guide"
          title="おすすめの流れ"
          defaultOpen={false}
        >
          <p className="font-ja text-sm leading-relaxed text-slate-700">
            <strong>おすすめの流れ：</strong>
            ① 設問・模範解答を入力 → ② 各問の「解答用紙形式」を指定 → ③「保存」
            → ④「問題用紙を印刷」で生徒に配布 → ⑤「解答用紙を自動生成」で別紙を印刷
            <br />
            形式の例：1問の中に (1)(2)(3) や (A)(B)(C) がある場合は「小問を追加」で解答欄を分け、ラベル形式を選べます。
          </p>
        </CollapsiblePanel>
        <Card className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="font-ja text-sm text-slate-600">テスト名</label>
              <Input
                value={draftTitle}
                onChange={(e) => {
                  setDraftTitle(e.target.value);
                  setSaveState("idle");
                }}
              />
            </div>
            <div>
              <label className="font-ja text-sm text-slate-600">解答用紙テンプレート</label>
              <select
                className="flex h-11 w-full rounded-lg border border-slate-200 px-3 font-ja text-sm"
                value={draftTemplateId}
                onChange={(e) => {
                  setDraftTemplateId(e.target.value);
                  setSaveState("idle");
                }}
              >
                <option value="">選択してください</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button onClick={addQuestion} className="min-h-11">
            第{draftQuestions.length + 1}問として設問を追加
          </Button>
          {testId && draftQuestions.length > 0 && (
            <TestValidityPanel
              testId={testId}
              draftQuestions={draftQuestions}
              onApplyRevision={applyRevision}
            />
          )}
          {testId && draftQuestions.length > 0 && (
            <>
              <Button variant="outline" className="gap-2" asChild>
                <Link to={`/tests/${testId}/print/test-paper`}>
                  <Printer className="h-4 w-4" />
                  問題用紙を印刷
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to={`/tests/${testId}/print/answer-key`}>
                  <FileText className="h-4 w-4" />
                  解答・解説・全訳
                </Link>
              </Button>
            </>
          )}
          <Button
            variant="default"
            className="gap-2 bg-green-800 hover:bg-green-700"
            disabled={draftQuestions.length === 0 || saveState === "saving"}
            onClick={generateAnswerSheet}
          >
            <FileText className="h-4 w-4" />
            解答用紙を自動生成
          </Button>
          {draftTemplateId && testId && (
            <Button variant="outline" asChild>
              <Link to={`/tests/${testId}/print/answer-sheet`}>解答用紙を再印刷</Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate("/tests")}>
            一覧に戻る
          </Button>
          <label className="inline-flex cursor-pointer items-center">
            <Button variant="outline" asChild>
              <span>プレビュー画像</span>
            </Button>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPreviewUrl(URL.createObjectURL(f));
              }}
            />
          </label>
        </div>

        {previewUrl && draftQuestions.length > 0 && (
          <Card>
            <h3 className="mb-4 font-ja font-semibold">Crop プレビュー</h3>
            <CropPreview
              imageUrl={previewUrl}
              regions={regions}
              selectedIndex={selectedQ}
              onSelect={setSelectedQ}
              onRegionChange={(flatIndex, region) => {
                const target = cropTargets[flatIndex];
                if (!target) return;
                const q = draftQuestions[target.questionIndex];
                if (target.hasParts && q.answerParts) {
                  updateDraftQuestion(target.questionIndex, {
                    answerParts: updateAnswerPart(q, target.partIndex, { cropRegion: region }).answerParts,
                  });
                } else {
                  updateDraftQuestion(target.questionIndex, { cropRegion: region });
                }
              }}
            />
          </Card>
        )}

        <div className="space-y-3">
          {draftQuestions.map((q, i) => (
            <CollapsiblePanel
              key={q.id}
              storageKey={`test-editor-q-${q.id}`}
              title={`第${q.order}問`}
              defaultOpen={i === 0}
              headerActions={
                <>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedQ(i)}>
                    crop
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="font-ja"
                    disabled={i === 0}
                    onClick={() => moveQuestion(i, -1)}
                  >
                    上へ
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="font-ja"
                    disabled={i === draftQuestions.length - 1}
                    onClick={() => moveQuestion(i, 1)}
                  >
                    下へ
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="font-ja text-slate-500 hover:text-red-700"
                    onClick={() => void removeQuestion(i)}
                  >
                    削除
                  </Button>
                </>
              }
            >
              <div className="space-y-3" data-preview-anchor={questionAnchor(q.id)}>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="font-ja text-sm">添削タイプ</label>
                  <select
                    className="flex h-11 w-full rounded-lg border px-3 font-ja text-sm"
                    value={q.type}
                    onChange={(e) => {
                      const type = e.target.value as QuestionType;
                      const suggestedFormat = DEFAULT_FORMAT[type];
                      updateDraftQuestion(i, {
                        type,
                        answerFormat: q.answerFormat ?? suggestedFormat,
                        formatOptions: q.formatOptions ?? { ...DEFAULT_OPTIONS[suggestedFormat] },
                      });
                    }}
                  >
                    <option value="english">英語</option>
                    <option value="japanese">日本語</option>
                    <option value="symbol">記号</option>
                  </select>
                </div>
                <div>
                  <label className="font-ja text-sm">配点</label>
                  <Input
                    type="number"
                    value={q.points}
                    onChange={(e) =>
                      updateDraftQuestion(i, { points: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="font-ja text-sm font-medium text-slate-800">問題文</label>
                <Textarea
                  value={q.prompt}
                  onChange={(e) => updateDraftQuestion(i, { prompt: e.target.value })}
                  rows={6}
                  className="mt-1"
                  data-preview-anchor={questionPromptAnchor(q.id)}
                />
                <p className="mt-1 font-ja text-xs text-slate-500">{QUESTION_TEXT_HINT}</p>
              </div>
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-1">
                    <label className="font-ja text-sm font-medium text-slate-700">解答欄</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="font-ja text-xs text-slate-500">小問ラベル</label>
                      <select
                        className="flex h-10 min-w-[9rem] rounded-lg border px-3 font-ja text-sm"
                        value={resolvePartLabelScheme(q)}
                        onChange={(e) => {
                          const scheme = e.target.value as PartLabelScheme;
                          const patch: Partial<Question> = { partLabelScheme: scheme };
                          if (q.answerParts?.length) {
                            patch.answerParts = relabelAnswerParts(q.answerParts, scheme);
                          }
                          updateDraftQuestion(i, patch);
                        }}
                      >
                        <option value="numeric">(1)(2)(3)…</option>
                        <option value="alpha">(A)(B)(C)…</option>
                      </select>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={() => updateDraftQuestion(i, addAnswerPart(q))}
                  >
                    小問を追加
                  </Button>
                </div>

                {q.answerParts && q.answerParts.length > 0 ? (
                  <div className="space-y-3">
                    {q.answerParts.map((part, partIndex) => (
                      <AnswerPartCard
                        key={`${q.id}-${partIndex}`}
                        part={part}
                        partIndex={partIndex}
                        question={q}
                        canRemove
                        onChange={(patch) =>
                          updateDraftQuestion(i, updateAnswerPart(q, partIndex, patch))
                        }
                        onRemove={() =>
                          updateDraftQuestion(i, removeAnswerPart(q, partIndex))
                        }
                      />
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => updateDraftQuestion(i, addAnswerPart(q))}
                    >
                      小問を追加
                    </Button>
                  </div>
                ) : (
                  <AnswerPartFormatFields
                    answerFormat={q.answerFormat ?? DEFAULT_FORMAT[q.type]}
                    formatOptions={q.formatOptions}
                    onChangeFormat={(answerFormat) =>
                      updateDraftQuestion(i, {
                        answerFormat,
                        formatOptions: { ...DEFAULT_OPTIONS[answerFormat] },
                      })
                    }
                    onChangeOptions={(formatOptions) =>
                      updateDraftQuestion(i, { formatOptions })
                    }
                  />
                )}
              </div>
              {!q.answerParts?.length && (
                <div>
                  <label className="font-ja text-sm">模範解答</label>
                  <Textarea
                    value={q.modelAnswer}
                    onChange={(e) => updateDraftQuestion(i, { modelAnswer: e.target.value })}
                    className="font-en"
                    rows={3}
                    placeholder="自由英作文など模範解答がない場合は空欄のままで構いません"
                    data-preview-anchor={questionUnitAnchor(q.id, q.id)}
                  />
                  {resolveGradingMode(q) === "no_model" ? (
                    <p className="mt-1 font-ja text-xs text-blue-700">{NO_MODEL_ANSWER_HINT}</p>
                  ) : (
                    <p className="mt-1 font-ja text-xs text-slate-500">
                      模範解答がある場合は通常プロンプトで採点します。
                    </p>
                  )}
                </div>
              )}
              {(questionShowsPassageTranslationField(
                q,
                draftTranslations[q.id] ?? "",
              ) ||
                (draftTranslations[q.id] ?? "").trim()) && (
                <div className="rounded-lg border-2 border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="font-ja text-sm font-semibold text-slate-800">
                      全訳（第{q.order}問のいちばん最後に印刷されます）
                    </label>
                    {supportsPassageTranslation(q) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11 gap-2"
                        disabled={translatingQuestionId === q.id}
                        onClick={() =>
                          void handleGeneratePassageTranslation(
                            q.id,
                            !questionNeedsAiPassageTranslation(q, draftTranslations[q.id] ?? ""),
                          )
                        }
                      >
                        <Sparkles className="h-4 w-4" />
                        {translatingQuestionId === q.id
                          ? "生成中…"
                          : questionNeedsAiPassageTranslation(q, draftTranslations[q.id] ?? "")
                            ? "AIで全訳を生成"
                            : "AIで全訳を再生成"}
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-1 font-ja text-xs leading-relaxed text-slate-500">
                    本文の全訳は問題生成後に手動で作成します（第2問(A)(B)・第3問は対象外）。模範解答内の【全訳】は自動でこの欄に移動します。
                  </p>
                  <Textarea
                    value={draftTranslations[q.id] ?? ""}
                    onChange={(e) => updateDraftTranslation(q.id, e.target.value)}
                    className="mt-2 font-ja"
                    rows={5}
                    placeholder={
                      translatingQuestionId === q.id
                        ? "AIが本文の全訳を生成しています…"
                        : "必要なとき「AIで全訳を生成」を押してください（手入力も可）"
                    }
                    readOnly={translatingQuestionId === q.id}
                    data-preview-anchor={questionPassageAnchor(q.id)}
                  />
                </div>
              )}
              </div>
            </CollapsiblePanel>
          ))}
        </div>
    </div>
  );

  const previewPane = (
    <div className="no-print flex h-full min-h-0 flex-col bg-slate-100">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <span className="mr-1 font-ja text-sm font-medium text-slate-600">印刷プレビュー</span>
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          variant={previewDoc === "paper" ? "default" : "outline"}
          onClick={() => setPreviewDoc("paper")}
        >
          問題用紙
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          variant={previewDoc === "answer_sheet" ? "default" : "outline"}
          onClick={() => setPreviewDoc("answer_sheet")}
          disabled={answerSheetSlots.length === 0}
        >
          解答用紙
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          variant={previewDoc === "answer_key" ? "default" : "outline"}
          onClick={() => setPreviewDoc("answer_key")}
        >
          解答・解説・全訳
        </Button>
      </div>
      <PreviewScrollArea scrollRef={previewScrollRef}>
        <ScaledPrintPreview className="box-border p-4 pb-8">
          {previewDoc === "paper" ? (
            <TestPaperPrintLayout
              testTitle={draftTitle || "テスト"}
              totalPoints={previewTotalPoints}
              questions={draftQuestions}
              settings={paperPrintSettings.settings}
            />
          ) : previewDoc === "answer_sheet" ? (
            <AnswerSheetPrintLayout
              testTitle={draftTitle || "テスト"}
              slots={answerSheetSlots}
              settings={paperPrintSettings.settings}
              questionIdByOrder={Object.fromEntries(
                draftQuestions.map((q) => [q.order, q.id]),
              )}
            />
          ) : (
            <TeacherAnswerKeyPrintLayout
              testTitle={draftTitle || "テスト"}
              questions={previewQuestions}
              units={previewUnits}
              settings={answerKeyPrintSettings.settings}
              sections={DEFAULT_ANSWER_KEY_PRINT_SECTIONS}
              passageTranslations={draftTranslations}
            />
          )}
        </ScaledPrintPreview>
      </PreviewScrollArea>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
      <PageHeader
        title="問題エディタ"
        description="左で編集すると右のプレビューが連動してスクロールします（境界をドラッグで幅調整）"
      />
      <SyncPreviewSplit
        storageKey="test-editor"
        defaultRatio={0.55}
        className="min-h-0 flex-1"
        previewScrollRef={previewScrollRef}
        left={editorPane}
        right={previewPane}
      />

      <div
        className="no-print fixed bottom-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8 lg:py-4"
        style={{
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          left: "var(--app-sidebar-width, 0px)",
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="font-ja text-sm text-slate-600">
            {saveState === "saving" && <InlineLoading message="保存中..." />}
            {saveState === "saved" && (
              <span className="flex items-center gap-1 text-green-700">
                <Check className="h-4 w-4" />
                保存しました
              </span>
            )}
            {saveState === "error" && (
              <span className="text-red-600">{saveError || "保存に失敗しました"}</span>
            )}
            {saveState === "idle" && isDirty && (
              <span className="text-amber-700">未保存の変更があります</span>
            )}
            {saveState === "idle" && !isDirty && (
              <span className="text-slate-400">すべて保存済み</span>
            )}
          </div>
          <Button
            className="min-w-32 gap-2"
            disabled={saveState === "saving" || !isDirty}
            onClick={handleSave}
          >
            <Save className="h-4 w-4" />
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}
