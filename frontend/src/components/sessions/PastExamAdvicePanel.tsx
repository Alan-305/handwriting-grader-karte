import { useEffect, useState } from "react";
import { Archive, RefreshCw } from "lucide-react";
import { AdviceCardItem } from "@/components/dashboard/AdviceCard";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import type { SessionPastExamAdvice } from "@/types/past-exam-advice";

interface PastExamAdvicePanelProps {
  sessionId: string;
  initialAdvice?: SessionPastExamAdvice | null;
}

export function PastExamAdvicePanel({ sessionId, initialAdvice }: PastExamAdvicePanelProps) {
  const { getIdToken } = useAuth();
  const [advice, setAdvice] = useState<SessionPastExamAdvice | null>(initialAdvice ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialAdvice) setAdvice(initialAdvice);
  }, [initialAdvice]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      setLoading(false);
      return;
    }
    try {
      const res = await apiClient.generatePastExamAdvice(token, sessionId);
      setAdvice(res.advice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アドバイスの生成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <LoadingOverlay visible={loading} message="考えてます" />
      <Card className="border-blue-100 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-ja text-lg">
            <Archive className="h-5 w-5 text-blue-800" />
            過去問視点のアドバイス
          </CardTitle>
          <CardDescription className="font-ja leading-relaxed">
            添削結果を東大過去問の出題系統と結びつけ、面談・次回指導に使えるアドバイスを生成します
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <Button className="min-h-11 gap-2" onClick={() => void generate()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            {advice ? "再生成する" : "アドバイスを生成"}
          </Button>
          {error && <p className="mt-3 font-ja text-sm text-red-700">{error}</p>}
        </div>
      </Card>

      {advice && (
        <div className="space-y-4">
          <Card className="p-6">
            <h3 className="font-ja text-base font-semibold text-slate-900">総評</h3>
            <p className="mt-2 font-ja text-sm leading-relaxed text-slate-700">{advice.overallSummary}</p>
            <p className="mt-4 font-ja text-sm leading-relaxed text-slate-600">{advice.readinessVsExam}</p>
          </Card>

          {advice.questionInsights.map((item) => (
            <Card key={item.questionOrder} className="space-y-3 p-6">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-ja font-semibold">第{item.questionOrder}問</h3>
                {item.matchedTypeLabel && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-ja text-xs">{item.matchedTypeLabel}</span>
                )}
              </div>
              <p className="font-ja text-sm text-slate-700">{item.performanceSummary}</p>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="font-ja text-xs font-medium text-slate-500">過去問との関係</p>
                <p className="mt-1 font-ja text-sm leading-relaxed text-slate-700">{item.pastExamConnection}</p>
              </div>
              <div className="rounded-lg bg-blue-50/50 p-3">
                <p className="font-ja text-xs font-medium text-blue-900">次の学習アクション</p>
                <p className="mt-1 font-ja text-sm leading-relaxed text-slate-800">{item.studyAction}</p>
              </div>
              {item.referencedPastQuestions.length > 0 && (
                <p className="font-ja text-xs text-slate-500">
                  参照: {item.referencedPastQuestions.join("、")}
                </p>
              )}
            </Card>
          ))}

          {advice.teacherTalkingPoints.length > 0 && (
            <Card className="p-6">
              <h3 className="font-ja text-base font-semibold text-slate-900">面談で伝える要点</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 font-ja text-sm leading-relaxed text-slate-700">
                {advice.teacherTalkingPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </Card>
          )}

          {advice.adviceCards.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {advice.adviceCards.map((card) => (
                <AdviceCardItem key={card.title} card={card} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
