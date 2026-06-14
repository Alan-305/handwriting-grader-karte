import { PreviewAnchor } from "@/components/print/PreviewAnchor";
import { PrintFlowDocument } from "@/components/print/PrintA4Page";
import {
  adviceCardAnchor,
  adviceQuestionAnchor,
  adviceReadinessAnchor,
  adviceSummaryAnchor,
} from "@/lib/preview-anchor";
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
import { compactStudentNameForPrintHeader } from "@/lib/student-print-text";
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
  studentName,
  sessionNumber,
  sections,
  layout,
  includedQuestions = {},
}: {
  advice: SessionPastExamAdvice;
  studentName?: string;
  sessionNumber?: number;
  sections: PastExamAdvicePrintSections;
  layout: GradingPrintLayoutSettings;
  includedQuestions?: Record<string, boolean>;
}) {
  const insights = advice.questionInsights.filter((item) =>
    isAdviceQuestionIncluded(includedQuestions, item.questionOrder),
  );
  const compactName = compactStudentNameForPrintHeader(studentName);
  const titlePrefix = sessionNumber != null ? `第${sessionNumber}回：` : "";

  return (
    <PrintFlowDocument
      className="print-layout-document grading-print-document"
      style={gradingPrintDocumentStyle(layout)}
      data-page-margin={layout.pageMargin}
    >
      <header className="print-doc-header border-b border-slate-200 pb-2 print:border-black">
        <h1 className="font-ja text-lg font-semibold leading-snug text-slate-900">
          {titlePrefix}過去問視点のアドバイス
          {compactName ? `（${compactName}）` : ""}
        </h1>
      </header>

      {adviceSectionOn(sections, "overallSummary") && advice.overallSummary ? (
        <PreviewAnchor anchor={adviceSummaryAnchor()} as="section" className="grading-print-block space-y-2">
          <h2 className="font-ja text-sm font-semibold text-slate-800">総評</h2>
          <p className="text-explanation whitespace-pre-line font-ja text-slate-700">
            {advice.overallSummary}
          </p>
        </PreviewAnchor>
      ) : null}

      {adviceSectionOn(sections, "readinessVsExam") && advice.readinessVsExam ? (
        <PreviewAnchor anchor={adviceReadinessAnchor()} as="section" className="grading-print-block space-y-2">
          <h2 className="font-ja text-sm font-semibold text-slate-800">受験準備度</h2>
          <p className="text-explanation whitespace-pre-line font-ja text-slate-600">
            {advice.readinessVsExam}
          </p>
        </PreviewAnchor>
      ) : null}

      {insights.length > 0
        ? insights.map((item, index) => {
        const breakBefore = shouldBreakBeforeQuestion(index, item.questionOrder, layout);
        const gapClass =
          shouldApplyQuestionGap(index, layout) ? "print-question-gap" : "";

        return (
          <PreviewAnchor
            key={item.questionOrder}
            anchor={adviceQuestionAnchor(item.questionOrder)}
            className={`print-question-wrap print-question-block--split-ok ${gapClass} ${breakBefore ? "print-break-before-page" : ""}`}
          >
            <section className="grading-print-question space-y-3 border-b border-slate-100 pb-6 print:border-black/20">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-ja text-sm font-semibold text-slate-800">第{item.questionOrder}問</h2>
                {item.matchedTypeLabel ? (
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-ja text-xs text-slate-600 print:bg-transparent">
                    {item.matchedTypeLabel}
                  </span>
                ) : null}
              </div>

              {adviceSectionOn(sections, "performanceSummary") && item.performanceSummary ? (
                <p className="grading-print-block text-explanation font-ja text-slate-700">
                  {item.performanceSummary}
                </p>
              ) : null}

              {adviceSectionOn(sections, "pastExamConnection") && item.pastExamConnection ? (
                <div className="grading-print-block rounded-lg bg-slate-50 p-3 print:bg-transparent print:p-0">
                  <p className="font-ja text-xs font-medium text-slate-500">過去問との関係</p>
                  <p className="text-explanation mt-1 font-ja text-slate-700">
                    {item.pastExamConnection}
                  </p>
                </div>
              ) : null}

              {adviceSectionOn(sections, "studyAction") && item.studyAction ? (
                <div className="grading-print-block rounded-lg bg-blue-50/50 p-3 print:bg-transparent print:p-0">
                  <p className="font-ja text-xs font-medium text-blue-900">次の学習アクション</p>
                  <p className="text-explanation mt-1 font-ja text-slate-800">
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
          </PreviewAnchor>
        );
      })
        : null}

      {adviceSectionOn(sections, "teacherTalkingPoints") &&
      advice.teacherTalkingPoints.length > 0 ? (
        <section className="grading-print-block space-y-2">
          <h2 className="font-ja text-sm font-semibold text-slate-800">面談で伝える要点</h2>
          <ul className="text-explanation list-disc space-y-2 pl-5 font-ja text-slate-700">
            {advice.teacherTalkingPoints.map((point, i) => (
              <li key={`${i}-${point.slice(0, 24)}`}>{point}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {adviceSectionOn(sections, "adviceCards") && advice.adviceCards.length > 0 ? (
        <section className="grading-print-block space-y-3">
          <h2 className="font-ja text-sm font-semibold text-slate-800">アドバイスカード</h2>
          <div className="space-y-3">
            {advice.adviceCards.map((card, cardIndex) => (
              <PreviewAnchor
                key={card.title}
                anchor={adviceCardAnchor(cardIndex)}
                className="rounded-lg border border-slate-200 p-4 print:border-black/20"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-ja text-sm font-semibold text-slate-900">{card.title}</h3>
                  <span className="font-ja text-xs text-slate-500">
                    {categoryLabels[card.category]}
                  </span>
                </div>
                <p className="text-explanation mt-2 font-ja text-slate-700">{card.body}</p>
              </PreviewAnchor>
            ))}
          </div>
        </section>
      ) : null}
    </PrintFlowDocument>
  );
}
