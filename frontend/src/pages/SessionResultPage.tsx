import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/AppShell";
import { FeedbackBlock } from "@/components/typography/Typography";
import { GradeBadge } from "@/components/grading/GradeBadge";
import { CompositionFeedbackSections } from "@/components/grading/CompositionFeedbackSections";
import { ModelAnswerPanel } from "@/components/grading/ModelAnswerPanel";
import { PastExamAdvicePanel } from "@/components/sessions/PastExamAdvicePanel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/hooks/useSession";
import { modelAnswerForPrint, studentAnswerForPrint } from "@/lib/question-results";
import {
  formatQuestionScore,
  formatTotalScoreLabel,
} from "@/lib/scoring";
import type { GradeLevel } from "@/types/firestore";

export function SessionResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { session, results, loading } = useSession(sessionId);

  useEffect(() => {
    if (!session || loading) return;
    if (session.status === "crop_review" || session.status === "aligned") {
      navigate(`/sessions/${sessionId}/crop-review`, { replace: true });
      return;
    }
    if (
      session.status === "transcription_review" ||
      session.status === "transcribing"
    ) {
      navigate(`/sessions/${sessionId}/transcription`, { replace: true });
      return;
    }
    if (session.status === "review" && !session.gradingConfirmedAt) {
      navigate(`/sessions/${sessionId}/grading-review`, { replace: true });
    }
  }, [session, loading, navigate, sessionId]);

  if (loading) {
    return <div className="p-8 font-ja text-slate-500">読み込み中...</div>;
  }

  return (
    <div>
      <PageHeader
        title="添削結果"
        description={session ? formatTotalScoreLabel(session) : undefined}
      />
      <div className="space-y-6 p-8">
        {session && (
          <Card className="border-slate-200 bg-slate-50 p-4">
            <p className="font-ja text-lg font-semibold text-slate-900">
              {formatTotalScoreLabel(session)}
            </p>
            <p className="mt-1 font-ja text-sm text-slate-500">
              内訳 {session.totalScore} / {session.maxScore}点
            </p>
          </Card>
        )}
        {session && !session.gradingConfirmedAt && (
          <Card className="border-amber-200 bg-amber-50 p-4 font-ja text-sm text-amber-950">
            添削はまだ確定していません。
            <Link
              to={`/sessions/${sessionId}/grading-review`}
              className="ml-1 font-semibold text-blue-800 underline"
            >
              添削内容の確認へ
            </Link>
          </Card>
        )}
        <div className="flex flex-wrap gap-2 no-print">
          <Button asChild variant="outline">
            <Link to={`/sessions/${sessionId}/grading-review`}>添削内容を編集</Link>
          </Button>
          <Button asChild variant="outline" disabled={!session?.gradingConfirmedAt}>
            <Link to={`/sessions/${sessionId}/print/student`}>返却プリントを編集・印刷</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/sessions/${sessionId}/print/teacher`}>教師用資料</Link>
          </Button>
          <Button asChild>
            <Link to="/sessions/new">新しい添削</Link>
          </Button>
        </div>

        <PastExamAdvicePanel sessionId={sessionId ?? ""} initialAdvice={session?.pastExamAdvice} />

        {results.map((r) => (
          <Card key={r.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-ja text-lg font-semibold">
                第{r.order}問{r.partLabel ? ` ${r.partLabel}` : ""}
              </h3>
              {r.grade ? <GradeBadge grade={r.grade as GradeLevel} /> : null}
            </div>
            <div>
              <p className="font-ja text-sm font-semibold text-slate-600">あなたの解答</p>
              <br />
              <p className="text-feedback font-en text-slate-900">
                {studentAnswerForPrint(r, results) || "—"}
              </p>
            </div>
            {r.feedback ? <FeedbackBlock title="講評">{r.feedback}</FeedbackBlock> : null}
            {r.contentEvaluation || r.grammarEvaluation || r.polishedAnswer ? (
              <CompositionFeedbackSections
                contentEvaluation={r.contentEvaluation}
                grammarEvaluation={r.grammarEvaluation}
                polishedAnswer={r.polishedAnswer}
              />
            ) : r.explanation ? (
              <div className="rounded-xl bg-slate-50 p-4">
                <FeedbackBlock title="解説">{r.explanation}</FeedbackBlock>
              </div>
            ) : null}
            {!r.polishedAnswer ? (
              <ModelAnswerPanel modelAnswer={modelAnswerForPrint(r, results)} />
            ) : null}
            <p className="font-ja text-sm font-medium text-slate-700">
              {formatQuestionScore(r)}
              {(r.errorTags?.length ?? 0) > 0 && (
                <span className="font-normal text-slate-500"> · {r.errorTags?.join("、")}</span>
              )}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
