import { FeedbackBlock } from "@/components/typography/Typography";

export function ComprehensiveReadingFeedbackSections({
  summary,
  explanation,
  modelAnswer,
  passageTranslation,
}: {
  /** 当該小問の総評（feedback） */
  summary?: string;
  explanation?: string;
  modelAnswer?: string;
  /** 本文の全訳（最後の小問のみ） */
  passageTranslation?: string;
}) {
  if (!summary && !explanation && !modelAnswer && !passageTranslation) {
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
      {explanation ? (
        <div className="grading-print-block rounded-xl bg-slate-50 p-4 print:bg-transparent print:p-0">
          <FeedbackBlock title="解説">
            <p className="whitespace-pre-line">{explanation}</p>
          </FeedbackBlock>
        </div>
      ) : null}
      {modelAnswer ? (
        <div className="grading-print-block rounded-xl border border-slate-200 bg-slate-50 p-4 print:border-0 print:bg-transparent print:p-0">
          <div className="space-y-1">
            <p className="font-ja text-sm font-semibold text-slate-600">模範解答</p>
            <p className="text-model-answer whitespace-pre-line font-en text-slate-900">{modelAnswer}</p>
          </div>
        </div>
      ) : null}
      {passageTranslation ? (
        <div className="grading-print-block rounded-xl border border-slate-200 bg-slate-50 p-4 print:border-0 print:bg-transparent print:p-0">
          <div className="space-y-1">
            <p className="font-ja text-sm font-semibold text-slate-600">全訳</p>
            <p className="text-explanation whitespace-pre-line font-ja text-slate-800">{passageTranslation}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
