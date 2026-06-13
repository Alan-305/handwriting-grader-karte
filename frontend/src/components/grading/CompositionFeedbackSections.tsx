import { FeedbackBlock } from "@/components/typography/Typography";

export function CompositionFeedbackSections({
  summary,
  contentEvaluation,
  grammarEvaluation,
  polishedAnswer,
}: {
  /** 自由英作文の総評（feedback） */
  summary?: string;
  contentEvaluation?: string;
  grammarEvaluation?: string;
  polishedAnswer?: string;
}) {
  if (!summary && !contentEvaluation && !grammarEvaluation && !polishedAnswer) {
    return null;
  }

  return (
    <div className="space-y-4">
      {summary ? (
        <div className="grading-print-block rounded-xl bg-slate-50 p-4 print:bg-transparent print:p-0">
          <FeedbackBlock title="総評">
            <p className="whitespace-pre-line">{summary}</p>
          </FeedbackBlock>
        </div>
      ) : null}
      {contentEvaluation ? (
        <div className="grading-print-block rounded-xl bg-slate-50 p-4 print:bg-transparent print:p-0">
          <FeedbackBlock title="内容について">
            <p className="whitespace-pre-line">{contentEvaluation}</p>
          </FeedbackBlock>
        </div>
      ) : null}
      {grammarEvaluation ? (
        <div className="grading-print-block rounded-xl bg-slate-50 p-4 print:bg-transparent print:p-0">
          <FeedbackBlock title="文法・語法・表現について">
            <p className="whitespace-pre-line">{grammarEvaluation}</p>
          </FeedbackBlock>
        </div>
      ) : null}
      {polishedAnswer ? (
        <div className="grading-print-block rounded-xl border border-blue-100 bg-blue-50/50 p-4 print:border-0 print:bg-transparent print:p-0">
          <div className="space-y-2">
            <p className="font-ja text-sm font-semibold text-slate-800">完成版</p>
            <p className="text-model-answer whitespace-pre-line font-en text-slate-900">{polishedAnswer}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
