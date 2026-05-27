import { useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Upload } from "lucide-react";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { SafeForm } from "@/components/forms/SafeForm";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { usePastExamUniversities } from "@/hooks/usePastExamUniversities";
import { apiClient } from "@/lib/api-client";

const UNIVERSITY_NAMES: Record<string, string> = {
  todai: "東京大学",
};

const PDF_SLOTS = [
  {
    key: "exam",
    label: "問題",
    required: true,
    multiple: true,
    description: "問題用紙 PDF。脚本ページは除き、リスニングは別枠でアップロードしてください。",
  },
  {
    key: "answers",
    label: "模範解答",
    required: false,
    multiple: false,
    description: "解答・解説 PDF。AI が大問ごとの模範解答を読み取ります。",
  },
  {
    key: "listening",
    label: "リスニングスクリプト",
    required: false,
    multiple: false,
    description: "リスニング音声用の脚本 PDF（東大二次など）。",
  },
  {
    key: "analysis",
    label: "分析シート",
    required: false,
    multiple: false,
    description: "入試分析シート・解説冊子などの PDF。原本として保存されます（大問一覧の教師分析資料とは別です）。",
  },
] as const;

export function PastExamImportPage() {
  const { slug = "" } = useParams();
  const { displayList } = usePastExamUniversities();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getIdToken } = useAuth();
  const examInputRef = useRef<HTMLInputElement>(null);
  const answersInputRef = useRef<HTMLInputElement>(null);
  const listeningInputRef = useRef<HTMLInputElement>(null);
  const analysisInputRef = useRef<HTMLInputElement>(null);

  const inputRefs = {
    exam: examInputRef,
    answers: answersInputRef,
    listening: listeningInputRef,
    analysis: analysisInputRef,
  };

  const defaultYear = searchParams.get("year") ?? String(new Date().getFullYear());
  const [year, setYear] = useState(defaultYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = displayList.find((u) => u.slug === slug)?.name ?? UNIVERSITY_NAMES[slug] ?? slug;

  const handleImport = async () => {
    setError(null);
    const yearNum = Number(year);
    if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100) {
      setError("年度は 1900〜2100 の整数で入力してください");
      return;
    }

    const examFiles = examInputRef.current?.files;
    if (!examFiles?.length) {
      setError("問題 PDF を選択してください");
      return;
    }

    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      return;
    }

    const formData = new FormData();
    formData.append("year", String(yearNum));
    for (const file of Array.from(examFiles)) {
      formData.append("examPdf", file);
    }
    const answersFile = answersInputRef.current?.files?.[0];
    if (answersFile) formData.append("answersPdf", answersFile);
    const listeningFile = listeningInputRef.current?.files?.[0];
    if (listeningFile) formData.append("listeningPdf", listeningFile);
    const analysisFile = analysisInputRef.current?.files?.[0];
    if (analysisFile) formData.append("analysisPdf", analysisFile);

    setLoading(true);
    try {
      const result = await apiClient.importPastExam(token, slug, formData);
      navigate(`/past-exams/${slug}/import/${result.sessionId}/review`, {
        state: { importResult: result },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "取り込みに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <LoadingOverlay visible={loading} message="取り込み中" />
      <PageHeader
        title={`${displayName} — 過去問取り込み`}
        description="問題・模範解答・リスニングスクリプト・分析シートの PDF をアップロードして解析します"
      />
      <div className="page-content mx-auto max-w-2xl space-y-6">
        <Button asChild variant="ghost" className="min-h-11 gap-2">
          <Link to={`/past-exams/${slug}`}>
            <ArrowLeft className="h-4 w-4" />
            年度一覧へ
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="font-ja text-base">取り込む年度</CardTitle>
            <CardDescription className="font-ja">
              任意の年度を指定できます。すでに登録済みの年度を再取り込みすると、内容が上書きされます。
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <label className="font-ja text-sm text-slate-600">入試年度</label>
            <Input
              type="number"
              min={1900}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="mt-1 max-w-xs"
              placeholder="例: 2027"
            />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-ja text-base">PDF ファイル（4種類）</CardTitle>
            <CardDescription className="font-ja leading-relaxed">
              東大などは 4 ファイルに分けると精度が上がります。問題のみ必須です。
              大問一覧の「教師分析資料」は取り込み後に別途入力できます。
            </CardDescription>
          </CardHeader>
          <SafeForm className="space-y-4 px-6 pb-6" onSafeSubmit={handleImport}>
            {PDF_SLOTS.map((slot, index) => (
              <div
                key={slot.key}
                className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
              >
                <label className="font-ja text-sm font-medium text-slate-800">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-800">
                    {index + 1}
                  </span>
                  {slot.label}
                  {slot.required ? (
                    <span className="ml-1 text-red-600">*</span>
                  ) : (
                    <span className="ml-2 font-normal text-slate-500">（任意）</span>
                  )}
                </label>
                <p className="font-ja text-xs leading-relaxed text-slate-600">{slot.description}</p>
                <Input
                  ref={inputRefs[slot.key]}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple={slot.multiple}
                />
              </div>
            ))}

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-ja text-sm text-red-800">
                {error}
              </p>
            )}

            <Button type="button" className="min-h-11 w-full gap-2" onClick={handleImport} disabled={loading}>
              <Upload className="h-4 w-4" />
              解析を開始
            </Button>
          </SafeForm>
        </Card>
      </div>
    </div>
  );
}
