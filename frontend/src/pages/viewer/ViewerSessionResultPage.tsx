import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/AppShell";
import { FeedbackBlock } from "@/components/typography/Typography";
import { GradeBadge } from "@/components/grading/GradeBadge";
import { CompositionFeedbackSections } from "@/components/grading/CompositionFeedbackSections";
import { ComprehensiveReadingFeedbackSections } from "@/components/grading/ComprehensiveReadingFeedbackSections";
import { ModelAnswerPanel } from "@/components/grading/ModelAnswerPanel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useViewerSession } from "@/hooks/useViewer";
import {
  isCompositionResult,
  isComprehensiveReadingResult,
  modelAnswerForPrint,
  passageTranslationForPrint,
  shouldShowModelAnswerPanel,
  studentAnswerForPrint,
} from "@/lib/question-results";
import { formatQuestionScore, formatTotalScoreLabel } from "@/lib/scoring";
import type { GradeLevel } from "@/types/firestore";

export function ViewerSessionResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session, results, loading } = useViewerSession(sessionId);

  if (loading) {
    return <div className="page-content font-ja text-slate-500">読み込み中...</div>;
  }

  const backTo = session?.studentId ? `/viewer/students/${session.studentId}` : "/viewer";

  return (
    <div>
      <PageHeader title="添削結果" description={session ? formatTotalScoreLabel(session) : undefined} />
      <div className="page-content mx-auto max-w-3xl space-y-6">
        <Button variant="outline" asChild>
          <Link to={backTo}>
            <ArrowLeft className="h-4 w-4" />
            カルテに戻る
          </Link>
        </Button>

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
            この添削結果はまだ確定前です。内容が変わる場合があります。
          </Card>
        )}

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
            {isCompositionResult(r) ? (
              <CompositionFeedbackSections
                summary={r.feedback}
                contentEvaluation={r.contentEvaluation}
                grammarEvaluation={r.grammarEvaluation}
                polishedAnswer={r.polishedAnswer}
              />
            ) : isComprehensiveReadingResult(r, results) ? (
              <ComprehensiveReadingFeedbackSections
                summary={r.feedback}
                explanation={r.explanation}
                modelAnswer={
                  shouldShowModelAnswerPanel(r, results)
                    ? modelAnswerForPrint(r, results)
                    : undefined
                }
                passageTranslation={passageTranslationForPrint(r, results)}
              />
            ) : (
              <>
                {r.feedback ? <FeedbackBlock title="講評">{r.feedback}</FeedbackBlock> : null}
                {r.explanation ? (
                  <div className="rounded-xl bg-slate-50 p-4">
                    <FeedbackBlock title="解説">
                      <p className="whitespace-pre-line">{r.explanation}</p>
                    </FeedbackBlock>
                  </div>
                ) : null}
                {shouldShowModelAnswerPanel(r, results) ? (
                  <ModelAnswerPanel modelAnswer={modelAnswerForPrint(r, results)} />
                ) : null}
              </>
            )}
            <p className="font-ja text-sm font-medium text-slate-700">
              {formatQuestionScore(r)}
              {(r.errorTags?.length ?? 0) > 0 && (
                <span className="font-normal text-slate-500"> · {r.errorTags?.join("、")}</span>
              )}
            </p>
          </Card>
        ))}

        {results.length === 0 && (
          <Card className="p-6 text-center font-ja text-sm text-slate-500">
            まだ表示できる添削結果がありません。
          </Card>
        )}
      </div>
    </div>
  );
}
