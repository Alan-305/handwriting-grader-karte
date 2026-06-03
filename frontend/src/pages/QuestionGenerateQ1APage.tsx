import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { SafeForm } from "@/components/forms/SafeForm";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { usePastExamUniversities } from "@/hooks/usePastExamUniversities";
import { useStudents } from "@/hooks/useStudent";
import { apiClient } from "@/lib/api-client";
import { primaryPastExamSlug } from "@/lib/resolve-university";
import type { ExamYearSummary } from "@/types/api";

const PIPELINE_STEPS = [
  "英文要約問題を作成中",
  "妥当性を検証中",
  "下書きを保存中",
] as const;

export function QuestionGenerateQ1APage() {
  const { getIdToken } = useAuth();
  const navigate = useNavigate();
  const { displayList: universityOptions } = usePastExamUniversities();
  const { students } = useStudents();

  const [slug, setSlug] = useState("todai");
  const [studentId, setStudentId] = useState("");
  const [examYears, setExamYears] = useState<ExamYearSummary[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [difficulty, setDifficulty] = useState("standard");
  const [topicHint, setTopicHint] = useState("");
  const [sourcePassage, setSourcePassage] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loadingYears, setLoadingYears] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadYears = useCallback(async () => {
    setLoadingYears(true);
    setError(null);
    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      setLoadingYears(false);
      return;
    }
    try {
      const yearsRes = await apiClient.listExamYears(token, slug);
      setExamYears(yearsRes.examYears);
      setSelectedYears(yearsRes.examYears.map((y) => y.year).slice(0, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "年度の取得に失敗しました");
    } finally {
      setLoadingYears(false);
    }
  }, [getIdToken, slug]);

  useEffect(() => {
    if (universityOptions.length > 0 && !universityOptions.some((u) => u.slug === slug)) {
      setSlug(universityOptions[0].slug);
    }
  }, [universityOptions, slug]);

  useEffect(() => {
    void loadYears();
  }, [loadYears]);

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

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setPipelineStep(0);

    const stepTimer = window.setInterval(() => {
      setPipelineStep((s) => Math.min(s + 1, PIPELINE_STEPS.length - 1));
    }, 9000);

    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      setGenerating(false);
      window.clearInterval(stepTimer);
      return;
    }

    try {
      const { draft } = await apiClient.generateQ1A(token, slug, {
        referenceYears: selectedYears.length > 0 ? selectedYears : undefined,
        difficulty,
        topicHint: topicHint.trim(),
        sourcePassage: sourcePassage.trim(),
        studentId: studentId || undefined,
      });
      navigate(draft.id ? `/question-drafts?focus=${draft.id}` : "/question-drafts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "第1問(A)の生成に失敗しました");
    } finally {
      window.clearInterval(stepTimer);
      setGenerating(false);
    }
  };

  const loadingMessage = PIPELINE_STEPS[pipelineStep] ?? "考えてます";

  return (
    <div>
      <LoadingOverlay visible={generating} message={loadingMessage} />
      <PageHeader
        title="第1問(A)の生成（英文要約）"
        description="東大第1問(A)形式で、300〜400語のアカデミック英文と70〜80字の日本語要約問題・模範解答・解説を生成します。"
      />
      <div className="page-content space-y-6">
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="ghost" className="min-h-11 gap-2">
            <Link to={`/past-exams/${slug}/generate`}>
              <ArrowLeft className="h-4 w-4" />
              問題生成メニュー
            </Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11 font-ja text-sm">
            <Link to="/question-drafts">下書き一覧</Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11 font-ja text-sm">
            <Link to="/questions/generate/q1b">第1問(B)の生成へ</Link>
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
                設問は「70〜80字の日本語で要約（句読点含む）」が標準形式です。模範要約も同字数で生成します。
              </CardDescription>
            </CardHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="font-ja text-sm text-slate-600">
                  生徒（任意・第一志望の過去問コーパスを自動選択）
                </label>
                <select
                  className="mt-1 flex h-11 w-full rounded-lg border border-slate-200 px-3 font-ja text-sm"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                >
                  <option value="">指定なし（下の志望校を使用）</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-ja text-sm text-slate-600">過去問コーパス（志望校）</label>
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
            </div>
            <div>
              <label className="font-ja text-sm text-slate-600">
                テーマ（お任せの場合は空欄または「お任せ」）
              </label>
              <Textarea
                className="mt-1 font-ja"
                rows={2}
                placeholder="例：テクノロジーと人間の関係、言語と思考、お任せ"
                value={topicHint}
                onChange={(e) => setTopicHint(e.target.value)}
              />
            </div>
            <div>
              <label className="font-ja text-sm text-slate-600">
                素材となる英文（任意・貼り付けるとこの英文を使用）
              </label>
              <Textarea
                className="mt-1 font-en text-sm"
                rows={6}
                placeholder="Paste source English passage here (optional)"
                value={sourcePassage}
                onChange={(e) => setSourcePassage(e.target.value)}
              />
            </div>
          </Card>

          <Card className="space-y-3 p-6">
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between font-ja text-sm font-medium text-slate-700"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              詳細設定（参照年度）
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showAdvanced && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="font-ja text-xs text-slate-500">
                  {universityName}の第1問(A)過去問から形式の目安を参照します。
                </p>
                {loadingYears ? (
                  <p className="font-ja text-sm text-slate-500">読み込み中...</p>
                ) : examYears.length === 0 ? (
                  <p className="font-ja text-sm text-slate-500">過去問がまだありません。</p>
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
              </div>
            )}
          </Card>

          <Card className="border-blue-100 bg-blue-50/50 p-4">
            <p className="font-ja text-sm text-slate-700">
              生成の流れ：①英文+設問+模範要約+解説 → ②字数・形式の検証 → ③下書き保存
            </p>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" className="min-h-11 gap-2" disabled={generating}>
              <Sparkles className="h-4 w-4" />
              第1問(A)を生成（検証付き）
            </Button>
          </div>
        </SafeForm>
      </div>
    </div>
  );
}
