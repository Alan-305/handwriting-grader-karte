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
import { apiClient } from "@/lib/api-client";

const UNIVERSITY_NAMES: Record<string, string> = {
  todai: "東京大学",
};

export function PastExamImportPage() {
  const { slug = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getIdToken } = useAuth();
  const examInputRef = useRef<HTMLInputElement>(null);
  const answersInputRef = useRef<HTMLInputElement>(null);
  const listeningInputRef = useRef<HTMLInputElement>(null);

  const defaultYear = searchParams.get("year") ?? String(new Date().getFullYear());
  const [year, setYear] = useState(defaultYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = UNIVERSITY_NAMES[slug] ?? slug;

  const handleImport = async () => {
    setError(null);
    const yearNum = Number(year);
    if (!Number.isInteger(yearNum) || yearNum < 1900 || yearNum > 2100) {
      setError("年度は 1900〜2100 の整数で入力してください");
      return;
    }

    const examFiles = examInputRef.current?.files;
    if (!examFiles?.length) {
      setError("問題用紙 PDF を選択してください");
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
        description="問題・解答・リスニング脚本の PDF をアップロードして解析します（数分かかることがあります）"
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
            <CardTitle className="font-ja text-base">PDF ファイル</CardTitle>
            <CardDescription className="font-ja leading-relaxed">
              東大など脚本がある入試は、問題・解答・脚本の 3 ファイルに分けると精度が上がります。
            </CardDescription>
          </CardHeader>
          <SafeForm className="space-y-5 px-6 pb-6" onSafeSubmit={handleImport}>
            <div className="space-y-2">
              <label className="font-ja text-sm font-medium text-slate-700">
                問題用紙 PDF <span className="text-red-600">*</span>
              </label>
              <Input ref={examInputRef} type="file" accept="application/pdf,.pdf" multiple />
            </div>
            <div className="space-y-2">
              <label className="font-ja text-sm font-medium text-slate-700">模範解答 PDF（任意）</label>
              <Input ref={answersInputRef} type="file" accept="application/pdf,.pdf" />
            </div>
            <div className="space-y-2">
              <label className="font-ja text-sm font-medium text-slate-700">リスニング脚本 PDF（任意）</label>
              <Input ref={listeningInputRef} type="file" accept="application/pdf,.pdf" />
            </div>

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
