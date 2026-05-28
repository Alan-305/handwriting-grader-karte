import { PrintFlowDocument } from "@/components/print/PrintA4Page";
import {
  adviceSectionOn,
  gradingPrintDocumentStyle,
  isAdviceQuestionIncluded,
  type GradingPrintLayoutSettings,
  type PastExamAdvicePrintSections,
} from "@/lib/past-exam-advice-print-config";
import {
  shouldApplyQuestionGap,
  shouldBreakBeforeQuestion,
} from "@/lib/print-layout-settings";
import type { SessionPastExamAdvice } from "@/types/past-exam-advice";
import type { AdviceCard } from "@/types/firestore";

const categoryLabels: Record<AdviceCard["category"], string> = {
  grammar: "文法",
  vocabulary: "語彙",
  structure: "文構造",
  exam_strategy: "受験戦略",
};

export function PastExamAdvicePrintLayout({
  advice,
  sections,
  layout,
  includedQuestions = {},
}: {
  advice: SessionPastExamAdvice;
  sections: PastExamAdvicePrintSections;
  layout: GradingPrintLayoutSettings;
  includedQuestions?: Record<string, boolean>;
}) {
  const insights = advice.questionInsights.filter((item) =>
    isAdviceQuestionIncluded(includedQuestions, item.questionOrder),
  );

  return (
    <PrintFlowDocument
      className="print-layout-document grading-print-document"
      style={gradingPrintDocumentStyle(layout)}
      data-page-margin={layout.pageMargin}
    >
      <header className="print-doc-header border-b border-slate-200 pb-4 print:border-black">
        <h1 className="font-ja text-2xl font-semibold">過去問視点のアドバイス</h1>
        <p className="font-ja text-sm text-slate-500">面談・次回指導用メモ</p>
      </header>

      {adviceSectionOn(sections, "overallSummary") && advice.overallSummary ? (
        <section className="grading-print-block space-y-2">
          <h2 className="font-ja text-base font-semibold text-slate-900">総評</h2>
          <p className="font-ja text-sm leading-relaxed text-slate-700">{advice.overallSummary}</p>
        </section>
      ) : null}

      {adviceSectionOn(sections, "readinessVsExam") && advice.readinessVsExam ? (
        <section className="grading-print-block space-y-2">
          <h2 className="font-ja text-base font-semibold text-slate-900">受験準備度</h2>
          <p className="font-ja text-sm leading-relaxed text-slate-600">{advice.readinessVsExam}</p>
        </section>
      ) : null}

      {insights.map((item, index) => {
        const breakBefore = shouldBreakBeforeQuestion(index, layout.sectionMode);
        const gapClass =
          shouldApplyQuestionGap(index, layout.sectionMode) ? "print-question-gap" : "";

        return (
          <div
            key={item.questionOrder}
            className={`print-question-wrap print-question-block ${gapClass} ${breakBefore ? "print-break-before-page" : ""}`}
          >
            <section className="grading-print-question space-y-3 border-b border-slate-100 pb-6 print:border-black/20">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-ja text-lg font-semibold">第{item.questionOrder}問</h2>
                {item.matchedTypeLabel ? (
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-ja text-xs print:bg-transparent">
                    {item.matchedTypeLabel}
                  </span>
                ) : null}
              </div>

              {adviceSectionOn(sections, "performanceSummary") && item.performanceSummary ? (
                <p className="grading-print-block font-ja text-sm text-slate-700">
                  {item.performanceSummary}
                </p>
              ) : null}

              {adviceSectionOn(sections, "pastExamConnection") && item.pastExamConnection ? (
                <div className="grading-print-block rounded-lg bg-slate-50 p-3 print:bg-transparent print:p-0">
                  <p className="font-ja text-xs font-medium text-slate-500">過去問との関係</p>
                  <p className="mt-1 font-ja text-sm leading-relaxed text-slate-700">
                    {item.pastExamConnection}
                  </p>
                </div>
              ) : null}

              {adviceSectionOn(sections, "studyAction") && item.studyAction ? (
                <div className="grading-print-block rounded-lg bg-blue-50/50 p-3 print:bg-transparent print:p-0">
                  <p className="font-ja text-xs font-medium text-blue-900">次の学習アクション</p>
                  <p className="mt-1 font-ja text-sm leading-relaxed text-slate-800">
                    {item.studyAction}
                  </p>
                </div>
              ) : null}

              {adviceSectionOn(sections, "referencedPastQuestions") &&
              item.referencedPastQuestions.length > 0 ? (
                <p className="grading-print-block font-ja text-xs text-slate-500">
                  参照: {item.referencedPastQuestions.join("、")}
                </p>
              ) : null}
            </section>
          </div>
        );
      })}

      {adviceSectionOn(sections, "teacherTalkingPoints") &&
      advice.teacherTalkingPoints.length > 0 ? (
        <section className="grading-print-block space-y-2">
          <h2 className="font-ja text-base font-semibold text-slate-900">面談で伝える要点</h2>
          <ul className="list-disc space-y-2 pl-5 font-ja text-sm leading-relaxed text-slate-700">
            {advice.teacherTalkingPoints.map((point, i) => (
              <li key={`${i}-${point.slice(0, 24)}`}>{point}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {adviceSectionOn(sections, "adviceCards") && advice.adviceCards.length > 0 ? (
        <section className="grading-print-block space-y-3">
          <h2 className="font-ja text-base font-semibold text-slate-900">アドバイスカード</h2>
          <div className="space-y-3">
            {advice.adviceCards.map((card) => (
              <div
                key={card.title}
                className="rounded-lg border border-slate-200 p-4 print:border-black/20"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-ja text-sm font-semibold text-slate-900">{card.title}</h3>
                  <span className="font-ja text-xs text-slate-500">
                    {categoryLabels[card.category]}
                  </span>
                </div>
                <p className="mt-2 font-ja text-sm leading-relaxed text-slate-700">{card.body}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </PrintFlowDocument>
  );
}
