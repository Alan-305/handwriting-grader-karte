import { QuestionPromptBlock } from "@/lib/question-text-format";
import {
  printLayoutDocumentStyle,
  shouldApplyQuestionGap,
  shouldBreakBeforeQuestion,
  type PrintLayoutSettings,
} from "@/lib/print-layout-settings";
import { PrintFlowDocument } from "@/components/print/PrintA4Page";
import type { Question } from "@/types/firestore";

function QuestionSection({
  question: q,
  showEndMarker,
}: {
  question: Question;
  showEndMarker: boolean;
}) {
  return (
    <section className="print-question-block print-break-avoid">
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-slate-300 pb-1">
        <h2 className="font-ja text-lg font-semibold">第{q.order}問</h2>
        <span className="shrink-0 font-ja text-sm text-slate-700">{q.points}点</span>
      </div>

      {q.prompt ? (
        <QuestionPromptBlock prompt={q.prompt} />
      ) : (
        <p className="font-ja text-sm text-slate-400">（問題文未入力）</p>
      )}

      {showEndMarker && (
        <p className="mt-6 text-center font-ja text-xs text-slate-500">― 問題ここまで ―</p>
      )}
    </section>
  );
}

export function TestPaperPrintLayout({
  testTitle,
  totalPoints,
  questions,
  settings,
}: {
  testTitle: string;
  totalPoints: number;
  questions: Question[];
  settings: PrintLayoutSettings;
}) {
  return (
    <PrintFlowDocument
      className="print-layout-document"
      data-section-mode={settings.sectionMode}
      data-page-margin={settings.pageMargin}
      style={printLayoutDocumentStyle(settings)}
    >
      <header className="print-doc-header border-b-2 border-slate-800 pb-5 text-center print:border-black">
        <h1 className="font-ja text-2xl font-semibold">{testTitle}</h1>
        <p className="mt-3 font-ja text-base text-slate-700">満点 {totalPoints}点</p>
      </header>

      {questions.map((q, index) => {
        const breakBefore = shouldBreakBeforeQuestion(index, settings.sectionMode);
        const applyGap = shouldApplyQuestionGap(index, settings.sectionMode);
        const isLast = index === questions.length - 1;

        return (
          <div
            key={q.id}
            className={[
              "print-question-wrap",
              breakBefore ? "print-break-before-page" : "",
              applyGap ? "print-question-gap" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <QuestionSection question={q} showEndMarker={isLast} />
          </div>
        );
      })}
    </PrintFlowDocument>
  );
}
