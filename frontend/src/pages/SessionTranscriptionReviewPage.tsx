import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { ErrorRetry } from "@/components/feedback/ErrorRetry";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { SafeForm } from "@/components/forms/SafeForm";
import { CroppedAnswerImage } from "@/components/sessions/CroppedAnswerImage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useSession, useUpdateQuestionResults } from "@/hooks/useSession";
import { apiClient } from "@/lib/api-client";
import { runGradingSteps } from "@/lib/session-pipeline";
import { formatGradingProgressMessage } from "@/lib/session-progress-message";
import type { QuestionResult, TranscriptionStatus } from "@/types/firestore";

type DraftRow = Pick<QuestionResult, "id" | "studentAnswerText">;

export function SessionTranscriptionReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { getIdToken } = useAuth();
  const { session, results, loading } = useSession(sessionId);
  const { saveResults } = useUpdateQuestionResults(sessionId);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const r of results) {
      next[r.id] = r.studentAnswerText ?? "";
    }
    setDrafts(next);
  }, [results]);

  const sortedResults = useMemo(
    () => [...results].sort((a, b) => a.order - b.order || (a.partIndex ?? 0) - (b.partIndex ?? 0)),
    [results],
  );

  const progressMessage = useMemo(() => {
    if (pipelineMessage) return pipelineMessage;
    const fromSession = formatGradingProgressMessage(session?.gradingProgress);
    if (fromSession) return fromSession;
    if (processing) return "添削を準備中";
    return null;
  }, [session?.gradingProgress, processing, pipelineMessage]);

  const handleConfirmAndGrade = async () => {
    if (!sessionId || sortedResults.length === 0) return;
    setProcessing(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) return;

      const items: DraftRow[] = sortedResults.map((r) => ({
        id: r.id,
        studentAnswerText: (drafts[r.id] ?? "").trim(),
      }));

      const empty = items.find((i) => !i.studentAnswerText);
      if (empty) {
        setError("空の転記があります。内容を入力するか、読み取りをやり直してください。");
        return;
      }

      await saveResults(
        items.map((i) => ({
          id: i.id,
          studentAnswerText: i.studentAnswerText,
          transcriptionStatus: "confirmed" as TranscriptionStatus,
        })),
      );

      await apiClient.patchTranscriptions(token, sessionId, {
        items: items.map((i) => ({
          id: i.id,
          studentAnswerText: i.studentAnswerText,
          transcriptionStatus: "confirmed",
        })),
        confirmAll: true,
      });

      setPipelineMessage("添削を開始しています…");
      await runGradingSteps(token, sessionId, (_current, _total, message) => {
        setPipelineMessage(message);
      });
      navigate(`/sessions/${sessionId}/grading-review`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "添削に失敗しました");
    } finally {
      setProcessing(false);
      setPipelineMessage("");
    }
  };

  if (loading) {
    return <div className="page-content font-ja text-slate-500">読み込み中...</div>;
  }

  if (!session) {
    return <div className="page-content font-ja text-slate-500">セッションが見つかりません</div>;
  }

  if (sortedResults.length === 0) {
    return (
      <div className="page-content">
        <p className="font-ja text-slate-600">転記データがありません。答案の読み取りからやり直してください。</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/sessions/new")}>
          答案添削へ戻る
        </Button>
      </div>
    );
  }

  return (
    <div>
      <LoadingOverlay visible={processing} message={progressMessage ?? "処理中"} />
      <PageHeader
        title="答案の読み取り確認"
        description="AIが善意に読み取った内容を確認・修正してから添削します"
      />
      <SafeForm
        className="page-content mx-auto max-w-3xl space-y-6"
        onSafeSubmit={handleConfirmAndGrade}
      >
        <Card className="border-blue-100 bg-blue-50/80 p-4 font-ja text-sm text-slate-700">
          手書きは試験中の字の乱れを想定して読み取っています。誤りがあればそのまま修正し、問題なければ「確定して添削へ」を押してください。設問ごとに添削するため、問数が多いと数分かかることがあります。
        </Card>

        {sortedResults.map((r) => (
          <Card key={r.id} className="space-y-4 p-5">
            <h3 className="font-ja text-lg font-semibold text-slate-900">
              第{r.order}問{r.partLabel ? ` ${r.partLabel}` : ""}
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 font-ja text-sm font-medium text-slate-600">手書き（切り出し）</p>
                <CroppedAnswerImage
                  storagePath={r.croppedImagePath}
                  alt={`第${r.order}問`}
                />
              </div>
              <div>
                <label
                  htmlFor={`transcription-${r.id}`}
                  className="mb-2 block font-ja text-sm font-medium text-slate-600"
                >
                  読み取りテキスト（編集可）
                </label>
                <textarea
                  id={`transcription-${r.id}`}
                  className="min-h-[200px] w-full rounded-lg border border-slate-200 px-3 py-2 font-ja text-base leading-relaxed text-slate-900"
                  value={drafts[r.id] ?? ""}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                  }
                />
              </div>
            </div>
          </Card>
        ))}

        {error && <ErrorRetry message={error} onRetry={handleConfirmAndGrade} />}

        <Button type="submit" className="min-h-11 w-full" disabled={processing}>
          確定して添削へ
        </Button>
      </SafeForm>
    </div>
  );
}
