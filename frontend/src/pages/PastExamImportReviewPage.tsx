import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Save } from "lucide-react";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import {
  ANSWER_FORMAT_LABELS,
  ANSWER_FORMAT_OPTIONS,
  resolveAnswerFormat,
} from "@/lib/past-exam-answer-format";
import type { PastExamImportResponse } from "@/types/api";
import type { AnswerFormat, ParsedPastQuestionDraft } from "@/types/past-exam";

function questionTitle(q: ParsedPastQuestionDraft) {
  const part = q.partLabel ? ` ${q.partLabel}` : "";
  return `第${q.majorOrder}問${part}`;
}

export function PastExamImportReviewPage() {
  const { slug = "", sessionId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { getIdToken } = useAuth();

  const initial = (location.state as { importResult?: PastExamImportResponse } | null)?.importResult;
  const [parsed, setParsed] = useState(initial?.parsed ?? null);
  const [meta] = useState(initial ?? null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const questions = parsed?.questions ?? [];

  const listeningCount = useMemo(
    () => parsed?.listeningScripts?.length ?? meta?.listeningScriptCount ?? 0,
    [parsed, meta],
  );

  if (!parsed || !meta) {
    return (
      <div className="p-8">
        <Card className="p-8 text-center font-ja">
          <p className="text-slate-600">取り込み結果が見つかりません。再度 PDF をアップロードしてください。</p>
          <Button asChild className="mt-6 min-h-11">
            <Link to={`/past-exams/${slug}/import`}>取り込み画面へ</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const updateQuestion = (
    index: number,
    field: keyof ParsedPastQuestionDraft,
    value: string | AnswerFormat,
  ) => {
    setParsed((prev) => {
      if (!prev) return prev;
      const next = [...prev.questions];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, questions: next };
    });
  };

  const commit = async (profileStatus: "draft" | "approved") => {
    setError(null);
    setSuccess(null);
    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      return;
    }

    setLoading(true);
    try {
      await apiClient.commitPastExamImport(token, slug, sessionId, {
        profileStatus,
        parsed,
      });
      setSuccess(profileStatus === "approved" ? "承認して保存しました" : "ドラフトとして保存しました");
      setTimeout(() => {
        navigate(`/past-exams/${slug}`, { state: { savedYear: meta.year } });
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <LoadingOverlay visible={loading} message="考えてます" />
      <PageHeader
        title={`${meta.universityName} ${meta.year} 年度 — 確認`}
        description={`大問 ${questions.length} 件 · リスニング脚本 ${listeningCount} 件`}
      />
      <div className="page-content space-y-6">
        <Button asChild variant="ghost" className="min-h-11 gap-2">
          <Link to={`/past-exams/${slug}/import`}>
            <ArrowLeft className="h-4 w-4" />
            取り込み画面へ
          </Link>
        </Button>

        {meta.parseNotes && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader>
              <CardTitle className="font-ja text-base">解析メモ</CardTitle>
              <CardDescription className="whitespace-pre-wrap font-ja leading-relaxed text-slate-700">
                {meta.parseNotes}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="space-y-4">
          {questions.map((q, index) => {
            const open = expandedIndex === index;
            const format = resolveAnswerFormat(q.answerFormat, q.prompt);
            return (
              <Card key={`${q.majorOrder}-${q.partLabel ?? index}`}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 p-6 text-left"
                  onClick={() => setExpandedIndex(open ? null : index)}
                >
                  <div>
                    <p className="font-ja font-semibold text-slate-900">{questionTitle(q)}</p>
                    <p className="mt-1 font-ja text-sm text-slate-500">{ANSWER_FORMAT_LABELS[format]}</p>
                  </div>
                  <span className="font-ja text-sm text-blue-800">{open ? "閉じる" : "編集"}</span>
                </button>
                {open && (
                  <div className="space-y-4 border-t border-slate-100 px-6 pb-6 pt-4">
                    <div>
                      <label className="font-ja text-sm text-slate-600">解答方式</label>
                      <select
                        value={format}
                        onChange={(e) =>
                          updateQuestion(index, "answerFormat", e.target.value as AnswerFormat)
                        }
                        className="mt-1 flex min-h-11 w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 font-ja text-sm"
                      >
                        {ANSWER_FORMAT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 font-ja text-xs text-slate-500">
                        和文要約は「日本語記述」、英作文は「英語記述」、マークシートは「記号」、混在は「総合問題」
                      </p>
                    </div>
                    <div>
                      <label className="font-ja text-sm text-slate-600">問題文</label>
                      <p className="mt-1 font-ja text-xs text-slate-500">
                        読解・リスニング設問は、指示に加え英語本文を省略せず含めてください。
                      </p>
                      <Textarea
                        value={q.prompt}
                        onChange={(e) => updateQuestion(index, "prompt", e.target.value)}
                        rows={12}
                        className="mt-1 font-ja"
                      />
                    </div>
                    <div>
                      <label className="font-ja text-sm text-slate-600">模範解答</label>
                      <Textarea
                        value={q.modelAnswer}
                        onChange={(e) => updateQuestion(index, "modelAnswer", e.target.value)}
                        rows={4}
                        className="mt-1 font-ja"
                      />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {parsed.listeningScripts && parsed.listeningScripts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-ja text-base">リスニング脚本</CardTitle>
              <CardDescription className="font-ja">
                {parsed.listeningScripts.length} セクションを検出しました
              </CardDescription>
            </CardHeader>
            <div className="space-y-4 px-6 pb-6">
              {parsed.listeningScripts.map((script, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-4">
                  <p className="font-ja font-medium">{script.title || `脚本 ${index + 1}`}</p>
                  <p className="mt-2 line-clamp-4 whitespace-pre-wrap font-en text-sm text-slate-600">
                    {script.content}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-ja text-sm text-red-800">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-ja text-sm text-green-800">
            {success}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            disabled={loading}
            onClick={() => commit("draft")}
          >
            <Save className="h-4 w-4" />
            ドラフト保存
          </Button>
          <Button type="button" className="min-h-11 gap-2" disabled={loading} onClick={() => commit("approved")}>
            <CheckCircle2 className="h-4 w-4" />
            承認して保存
          </Button>
        </div>
      </div>
    </div>
  );
}
