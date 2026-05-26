import { FeedbackBlock } from "@/components/typography/Typography";
import { TtsButton } from "@/components/grading/ModelAnswerPanel";

export function CompositionFeedbackSections({
  contentEvaluation,
  grammarEvaluation,
  polishedAnswer,
}: {
  contentEvaluation?: string;
  grammarEvaluation?: string;
  polishedAnswer?: string;
}) {
  if (!contentEvaluation && !grammarEvaluation && !polishedAnswer) {
    return null;
  }

  return (
    <div className="space-y-4">
      {contentEvaluation ? (
        <div className="rounded-xl bg-slate-50 p-4">
          <FeedbackBlock title="内容の評価・解説">{contentEvaluation}</FeedbackBlock>
        </div>
      ) : null}
      {grammarEvaluation ? (
        <div className="rounded-xl bg-slate-50 p-4">
          <FeedbackBlock title="文法・語法の評価・解説">{grammarEvaluation}</FeedbackBlock>
        </div>
      ) : null}
      {polishedAnswer ? (
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <div className="flex-1 space-y-2">
            <p className="font-ja text-sm font-semibold text-slate-800">完成版（アドバイスを盛り込んだ英文）</p>
            <p className="text-model-answer font-en text-slate-900">{polishedAnswer}</p>
          </div>
          <TtsButton text={polishedAnswer} lang="en" />
        </div>
      ) : null}
    </div>
  );
}
