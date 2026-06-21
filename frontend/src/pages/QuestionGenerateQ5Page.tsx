import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
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
import type { ExamYearSummary } from "@/types/api";

const PIPELINE_STEPS = [
  "物語本文を作成中",
  "設問を作成中",
  "解答の妥当性を検証中",
  "解答・解説を作成中",
  "下書きを保存中",
] as const;

export function QuestionGenerateQ5Page() {
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
      const defaultYears = yearsRes.examYears.map((y) => y.year).slice(0, 2);
      setSelectedYears(defaultYears);
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
    }, 12000);

    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      setGenerating(false);
      window.clearInterval(stepTimer);
      return;
    }

    try {
      const { draft } = await apiClient.generateQ5(token, slug, {
        referenceYears: selectedYears.length > 0 ? selectedYears : undefined,
        difficulty,
        topicHint: topicHint.trim(),
        studentId: studentId || undefined,
      });
      navigate(draft.id ? `/question-drafts?focus=${draft.id}` : "/question-drafts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "第5問の生成に失敗しました");
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
        title="第5問の生成（二次入試）"
        description="東大第5問形式（物語・随筆／空所補充・下線部・内容一致・日本語記述・並べ替え）で生成します。共通テストの第5問定型にはしません。参照年度で過去問を手本にします。"
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
            <Link to="/questions/generate/q1a">第1問(A)の生成へ</Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11 font-ja text-sm">
            <Link to="/questions/generate/q4a">第4問(A)の生成へ</Link>
          </Button>
          <Button asChild variant="ghost" className="min-h-11 font-ja text-sm">
            <Link to="/questions/generate">従来の型別生成へ</Link>
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
                東大第5問形式（物語・随筆／空所補充・内容説明・理由説明・語法一致・表現の意味・英文一致・下線部・並べ替えなど）。
                小問6〜8個を英文に合わせて組み合わせ、各小問の本文参照箇所は重複させません。共通テスト定型にはしません。
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
              <label className="font-ja text-sm text-slate-600">題材の方向性（任意）</label>
              <Textarea
                className="mt-1 font-ja"
                rows={3}
                placeholder="例：部活動での失敗と成長、環境ボランティア、進路選択"
                value={topicHint}
                onChange={(e) => setTopicHint(e.target.value)}
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
                  {universityName}の過去問から形式の目安を参照します。未選択時は直近年度を自動参照します。
                </p>
                {loadingYears ? (
                  <p className="font-ja text-sm text-slate-500">読み込み中...</p>
                ) : examYears.length === 0 ? (
                  <p className="font-ja text-sm text-slate-500">
                    過去問がまだありません（参照なしでも生成できます）。
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
              </div>
            )}
          </Card>

          <Card className="border-blue-100 bg-blue-50/50 p-4">
            <p className="font-ja text-sm text-slate-700">
              生成の流れ：①物語・随筆本文 → ②小問6〜8個（多技能） → ③妥当性検証 → ④正答・解説（全訳は答案用紙画面で後から生成）
            </p>
            <p className="mt-2 font-ja text-xs text-slate-500">
              完了まで1〜3分かかることがあります。チャットでの修正は次の段階で追加予定です。
            </p>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" className="min-h-11 gap-2" disabled={generating}>
              <Sparkles className="h-4 w-4" />
              第5問を生成（検証付き）
            </Button>
          </div>
        </SafeForm>
      </div>
    </div>
  );
}
