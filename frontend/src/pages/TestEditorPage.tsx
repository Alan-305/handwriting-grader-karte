import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { Check, FileText, Printer, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { CropPreview } from "@/components/upload/CropPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { generateAnswerSheetLayout } from "@/lib/answer-sheet-layout";
import {
  addAnswerPart,
  applyLayoutCropRegions,
  expandAnswerUnits,
  removeAnswerPart,
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
import { QUESTION_TEXT_HINT, QuestionPromptBlock } from "@/lib/question-text-format";
import type {
  AnswerSheetTemplate,
  CropRegion,
  Question,
  QuestionType,
  Test,
} from "@/types/firestore";

const DEFAULT_REGION: CropRegion = { x: 50, y: 50, width: 400, height: 120 };

type SaveState = "idle" | "saving" | "saved" | "error";

export function TestEditorPage() {
  const { testId } = useParams<{ testId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTemplateId, setDraftTemplateId] = useState("");
  const [draftQuestions, setDraftQuestions] = useState<Question[]>([]);
  const [templates, setTemplates] = useState<AnswerSheetTemplate[]>([]);
  const [selectedQ, setSelectedQ] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");

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
      setQuestions(loaded);
      setDraftQuestions(loaded);
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
    return draftQuestions.some((dq) => {
      const orig = questions.find((q) => q.id === dq.id);
      if (!orig) return true;
      return JSON.stringify(dq) !== JSON.stringify(orig);
    });
  }, [test, draftTitle, draftTemplateId, draftQuestions, questions]);

  const updateDraftQuestion = (index: number, patch: Partial<Question>) => {
    setDraftQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
    setSaveState("idle");
  };

  const applyRevision = (questionOrder: number, field: string, value: string) => {
    setDraftQuestions((prev) =>
      prev.map((q) => {
        if (q.order !== questionOrder) return q;
        if (field === "points") {
          const points = Number(value);
          return Number.isFinite(points) ? { ...q, points } : q;
        }
        if (field === "prompt") return { ...q, prompt: value };
        if (field === "modelAnswer") return { ...q, modelAnswer: value };
        return q;
      }),
    );
    setSaveState("idle");
  };

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

  const handleSave = async () => {
    if (!testId) return;
    setSaveState("saving");
    setSaveError("");
    try {
      const batch = writeBatch(getDb());
      const totalPoints = draftQuestions.reduce((s, q) => s + q.points, 0);

      batch.update(doc(getDb(), "tests", testId), {
        title: draftTitle,
        templateId: draftTemplateId,
        totalPoints,
        questionCount: draftQuestions.length,
        updatedAt: serverTimestamp(),
      });

      for (const q of draftQuestions) {
        const { id, ...data } = q;
        batch.update(doc(getDb(), "tests", testId, "questions", id), data);
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
      const layout = generateAnswerSheetLayout(draftQuestions);

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
      const totalPoints = updatedQuestions.reduce((s, q) => s + q.points, 0);
      batch.update(doc(getDb(), "tests", testId), {
        title: draftTitle,
        templateId: tplRef.id,
        totalPoints,
        questionCount: updatedQuestions.length,
        updatedAt: serverTimestamp(),
      });
      for (const q of updatedQuestions) {
        const { id, ...data } = q;
        batch.update(doc(getDb(), "tests", testId, "questions", id), data);
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

  return (
    <div className="pb-24">
      <PageHeader
        title="問題エディタ"
        description="問題を入力 →「解答用紙を自動生成」で印刷用用紙と切り出し位置を一括設定"
      />
      <div className="space-y-6 p-8">
        <Card className="border-blue-100 bg-blue-50/40 p-4">
          <p className="font-ja text-sm leading-relaxed text-slate-700">
            <strong>おすすめの流れ：</strong>
            ① 設問・模範解答を入力 → ② 各問の「解答用紙形式」を指定 → ③「保存」
            → ④「問題用紙を印刷」で生徒に配布 → ⑤「解答用紙を自動生成」で別紙を印刷
            <br />
            形式の例：1問の中に (1)(2)(3) がある場合は「小問を追加」で解答欄を分けて指定できます。
          </p>
        </Card>
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
          <Button onClick={addQuestion}>設問を追加</Button>
          {testId && draftQuestions.length > 0 && (
            <TestValidityPanel
              testId={testId}
              draftQuestions={draftQuestions}
              onApplyRevision={applyRevision}
            />
          )}
          {testId && draftQuestions.length > 0 && (
            <Button variant="outline" className="gap-2" asChild>
              <Link to={`/tests/${testId}/print/test-paper`}>
                <Printer className="h-4 w-4" />
                問題用紙を印刷
              </Link>
            </Button>
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

        <div className="space-y-4">
          {draftQuestions.map((q, i) => (
            <Card key={q.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-ja font-semibold">第{q.order}問</h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedQ(i)}>
                  crop 選択
                </Button>
              </div>
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
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-ja text-sm font-medium text-slate-700">解答欄</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateDraftQuestion(i, addAnswerPart(q))
                    }
                  >
                    小問 (1)(2)… を追加
                  </Button>
                </div>

                {q.answerParts && q.answerParts.length > 0 ? (
                  <div className="space-y-3">
                    {q.answerParts.map((part, partIndex) => (
                      <AnswerPartCard
                        key={`${q.id}-${partIndex}`}
                        part={part}
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
              <div>
                <label className="font-ja text-sm">問題文</label>
                <Textarea
                  value={q.prompt}
                  onChange={(e) => updateDraftQuestion(i, { prompt: e.target.value })}
                  rows={5}
                />
                <p className="mt-1 font-ja text-xs text-slate-500">{QUESTION_TEXT_HINT}</p>
                {q.prompt.trim() && (
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-1 font-ja text-xs font-medium text-slate-500">印刷プレビュー</p>
                    <QuestionPromptBlock prompt={q.prompt} />
                  </div>
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
            </Card>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-8 py-4 backdrop-blur md:left-64">
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
