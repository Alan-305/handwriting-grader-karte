import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ListChecks, Sparkles } from "lucide-react";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { SafeForm } from "@/components/forms/SafeForm";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { usePastExamUniversities } from "@/hooks/usePastExamUniversities";
import { useStudents } from "@/hooks/useStudent";
import { apiClient } from "@/lib/api-client";
import { primaryPastExamSlug } from "@/lib/resolve-university";
import { sortQuestionTypes } from "@/lib/sort-question-types";
import type { ExamYearSummary } from "@/types/api";
import type { QuestionTypeCatalogItem } from "@/types/question-design";

function typeSelectionKey(item: QuestionTypeCatalogItem) {
  return `${item.majorOrder}:${item.partLabel ?? ""}`;
}

export function QuestionGeneratePage() {
  const { user, getIdToken } = useAuth();
  const navigate = useNavigate();
  const { displayList: universityOptions } = usePastExamUniversities();

  const [slug, setSlug] = useState("todai");
  const [examYears, setExamYears] = useState<ExamYearSummary[]>([]);
  const [questionTypes, setQuestionTypes] = useState<QuestionTypeCatalogItem[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [difficulty, setDifficulty] = useState("standard");
  const [topicHint, setTopicHint] = useState("");
  const [countPerType, setCountPerType] = useState(1);
  const { students } = useStudents();
  const [studentId, setStudentId] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setError(null);
    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      setLoadingCatalog(false);
      return;
    }
    try {
      const [yearsRes, typesRes] = await Promise.all([
        apiClient.listExamYears(token, slug),
        apiClient.listQuestionTypes(token, slug),
      ]);
      setExamYears(yearsRes.examYears);
      setQuestionTypes(sortQuestionTypes(typesRes.questionTypes));
      const defaultYears = yearsRes.examYears.map((y) => y.year).slice(0, 2);
      setSelectedYears(defaultYears);
    } catch (err) {
      setError(err instanceof Error ? err.message : "データの取得に失敗しました");
    } finally {
      setLoadingCatalog(false);
    }
  }, [getIdToken, slug]);

  useEffect(() => {
    if (universityOptions.length > 0 && !universityOptions.some((u) => u.slug === slug)) {
      setSlug(universityOptions[0].slug);
    }
  }, [universityOptions, slug]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!studentId) return;
    const student = students.find((s) => s.id === studentId);
    const resolved = primaryPastExamSlug(student);
    if (resolved) setSlug(resolved);
  }, [studentId, students]);

  const universityName = useMemo(
    () => universityOptions.find((u) => u.slug === slug)?.name ?? slug,
    [universityOptions, slug],
  );

  const toggleYear = (year: number) => {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year].sort((a, b) => b - a),
    );
  };

  const toggleType = (key: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (selectedTypes.size === 0) {
      setError("生成する型を1つ以上選択してください");
      return;
    }
    setGenerating(true);
    setError(null);
    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      setGenerating(false);
      return;
    }

    const selections = questionTypes
      .filter((t) => selectedTypes.has(typeSelectionKey(t)))
      .map((t) => ({
        majorOrder: t.majorOrder,
        partLabel: t.partLabel,
        typeLabel: t.typeLabel,
      }));

    try {
      await apiClient.generateQuestions(token, slug, {
        selections,
        referenceYears: selectedYears.length > 0 ? selectedYears : undefined,
        difficulty,
        topicHint: topicHint.trim(),
        countPerType,
        studentId: studentId || undefined,
      });
      navigate("/question-drafts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "問題・模範解答の生成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

  const selectionsForBuild = () =>
    questionTypes
      .filter((t) => selectedTypes.has(typeSelectionKey(t)))
      .map((t) => ({ majorOrder: t.majorOrder, partLabel: t.partLabel, typeLabel: t.typeLabel }));

  const handleBuildSet = async () => {
    if (selectedTypes.size === 0) {
      setError("生成する型を1つ以上選択してください");
      return;
    }
    setBuilding(true);
    setError(null);
    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      setBuilding(false);
      return;
    }

    try {
      const { draft } = await apiClient.buildTestDraft(token, slug, {
        selections: selectionsForBuild(),
        referenceYears: selectedYears.length > 0 ? selectedYears : undefined,
        difficulty,
        topicHint: topicHint.trim(),
        countPerType,
        studentId: studentId || undefined,
      });
      navigate(`/test-drafts?focus=${draft.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "セット下書きの作成に失敗しました");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div>
      <LoadingOverlay
        visible={generating || building}
        message={building ? "セットを設計・検証中" : "考えてます"}
      />
      <PageHeader
        title="問題・模範解答の生成"
        description="過去問の出題型（第1問(A)など）を選び、新しいオリジナルの問題文と模範解答を生成します"
      />
      <div className="page-content space-y-6">
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" className="min-h-11 font-ja text-sm">
            <Link to="/questions/generate/q1a">第1問(A)型の生成</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 font-ja text-sm">
            <Link to="/questions/generate/q1b">第1問(B)型の生成</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 font-ja text-sm">
            <Link to="/questions/generate/q2a">第2問(A)型の生成</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 font-ja text-sm">
            <Link to="/questions/generate/q2b">第2問(B)型の生成</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 font-ja text-sm">
            <Link to="/questions/generate/q4a">第4問(A)型の生成</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 font-ja text-sm">
            <Link to="/questions/generate/q4b">第4問(B)型の生成</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 font-ja text-sm">
            <Link to="/questions/generate/q5">第5問型の生成（推奨）</Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11 gap-2">
            <Link to="/question-drafts">
              <ArrowLeft className="h-4 w-4" />
              下書き一覧
            </Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11 gap-2">
            <Link to="/test-drafts">
              <ListChecks className="h-4 w-4" />
              セット下書き
            </Link>
          </Button>
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50 p-4">
            <p className="font-ja text-sm text-red-800">{error}</p>
          </Card>
        )}

        <SafeForm className="space-y-6" onSafeSubmit={handleGenerate}>
          <Card className="space-y-4 p-6">
            <CardHeader className="p-0">
              <CardTitle className="font-ja text-base">基本設定</CardTitle>
              <CardDescription className="font-ja">
                参照する大学・年度・難易度を指定します
              </CardDescription>
            </CardHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="font-ja text-sm text-slate-600">志望校</label>
                <select
                  className="mt-1 flex h-11 w-full rounded-lg border border-slate-200 px-3 font-ja text-sm"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                >
                  {universityOptions.map((u) => (
                    <option key={u.slug} value={u.slug}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-ja text-sm text-slate-600">難易度</label>
                <select
                  className="mt-1 flex h-11 w-full rounded-lg border border-slate-200 px-3 font-ja text-sm"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="standard">東大標準</option>
                  <option value="easier">やや易しめ</option>
                  <option value="harder">やや難しめ</option>
                </select>
              </div>
              <div>
                <label className="font-ja text-sm text-slate-600">1型あたりの生成数</label>
                <Input
                  type="number"
                  min={1}
                  max={3}
                  className="mt-1"
                  value={countPerType}
                  onChange={(e) => setCountPerType(Math.min(3, Math.max(1, Number(e.target.value) || 1)))}
                />
              </div>
              <div>
                <label className="font-ja text-sm text-slate-600">
                  生徒（カルテ反映・任意）
                </label>
                <select
                  className="mt-1 flex h-11 w-full rounded-lg border border-slate-200 px-3 font-ja text-sm"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                >
                  <option value="">指定なし（汎用セット）</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 font-ja text-xs text-slate-500">
                  選ぶと第一志望の過去問コーパスを自動選択し、カルテの弱点反映（セット作成時）にも使います
                </p>
              </div>
            </div>
            <div>
              <label className="font-ja text-sm text-slate-600">題材の方向性（任意）</label>
              <Textarea
                className="mt-1 font-ja"
                rows={2}
                placeholder="例：教育制度、環境問題、科学技術"
                value={topicHint}
                onChange={(e) => setTopicHint(e.target.value)}
              />
            </div>
          </Card>

          <Card className="space-y-4 p-6">
            <CardHeader className="p-0">
              <CardTitle className="font-ja text-base">参照年度</CardTitle>
              <CardDescription className="font-ja">
                {universityName}の取り込み済み年度から選択（未選択時は全年度）
              </CardDescription>
            </CardHeader>
            {loadingCatalog ? (
              <p className="font-ja text-sm text-slate-500">読み込み中...</p>
            ) : examYears.length === 0 ? (
              <p className="font-ja text-sm text-slate-500">
                過去問がまだありません。
                <Link to={`/past-exams/${slug}/import`} className="ml-1 text-blue-800 underline">
                  取り込む
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {examYears.map((y) => (
                  <label
                    key={y.year}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 font-ja text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedYears.includes(y.year)}
                      onChange={() => toggleYear(y.year)}
                    />
                    {y.year}年度
                  </label>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4 p-6">
            <CardHeader className="p-0">
              <CardTitle className="font-ja text-base">生成する型</CardTitle>
              <CardDescription className="font-ja">
                第1問(A)型など、必要な出題型だけ選んでください（1年度分まるごと作りません）
              </CardDescription>
            </CardHeader>
            {loadingCatalog ? (
              <p className="font-ja text-sm text-slate-500">型一覧を読み込み中...</p>
            ) : questionTypes.length === 0 ? (
              <p className="font-ja text-sm text-slate-500">参照できる型がありません</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {questionTypes.map((t) => {
                  const key = typeSelectionKey(t);
                  return (
                    <label
                      key={key}
                      className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 font-ja text-sm hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedTypes.has(key)}
                        onChange={() => toggleType(key)}
                      />
                      <span>
                        <span className="font-medium">{t.typeLabel}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          参照: {t.years.join("・")}年度
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-2"
              disabled={generating || building || selectedTypes.size === 0}
              onClick={() => void handleBuildSet()}
            >
              <ListChecks className="h-4 w-4" />
              検証付きセット下書きを作成
            </Button>
            <Button
              type="submit"
              className="min-h-11 gap-2"
              disabled={generating || building || selectedTypes.size === 0}
            >
              <Sparkles className="h-4 w-4" />
              問題と模範解答を生成
            </Button>
          </div>
          <p className="font-ja text-xs text-slate-500">
            「生成」は1問ずつの下書き、「セット下書き」は複数問をまとめて作り、想定誤答と過去問との妥当性検証まで自動で行います。
          </p>
        </SafeForm>
      </div>
    </div>
  );
}
