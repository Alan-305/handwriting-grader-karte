import { groupLayoutSlots, type LayoutSlot } from "@/lib/answer-sheet-layout";
import {
  printLayoutDocumentStyle,
  shouldApplyQuestionGap,
  shouldBreakBeforeQuestion,
  type PrintLayoutSettings,
} from "@/lib/print-layout-settings";
import { AnswerField } from "@/components/print/AnswerField";
import { PrintFixedCornerMarks, PrintFlowDocument } from "@/components/print/PrintA4Page";

function AnswerQuestionSection({
  order,
  parts,
  showEndMarker,
}: {
  order: number;
  parts: LayoutSlot[];
  showEndMarker: boolean;
}) {
  return (
    <section className="print-question-block print-break-avoid">
      <p className="mb-3 font-ja text-base font-semibold">第{order}問</p>
      <div className={parts.length > 1 ? "space-y-4" : undefined}>
        {parts.map((slot) => (
          <div key={slot.slotKey} className="print-break-avoid">
            {slot.partLabel && (
              <p className="mb-1 font-ja text-xs font-medium text-slate-700">{slot.partLabel}</p>
            )}
            <AnswerField format={slot.answerFormat} formatOptions={slot.formatOptions} />
          </div>
        ))}
      </div>

      {showEndMarker && (
        <p className="mt-6 text-center font-ja text-xs text-slate-500">― 解答ここまで ―</p>
      )}
    </section>
  );
}

export function AnswerSheetPrintLayout({
  testTitle,
  slots,
  settings,
}: {
  testTitle: string;
  slots: LayoutSlot[];
  settings: PrintLayoutSettings;
}) {
  const groups = groupLayoutSlots(slots);

  return (
    <PrintFlowDocument
      className="print-layout-document print-flow-document--answer-sheet relative"
      data-section-mode={settings.sectionMode}
      data-page-margin={settings.pageMargin}
      style={printLayoutDocumentStyle(settings)}
    >
      <PrintFixedCornerMarks />

      <header className="print-doc-header border-b border-slate-300 pb-5 text-center print:border-black">
        <h1 className="font-ja text-xl font-semibold">{testTitle}</h1>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-ja text-sm text-slate-700">
          <span>氏名 ________________________</span>
          <span>解答時間 ________________________</span>
        </div>
      </header>

      {groups.map(({ order, parts }, index) => {
        const breakBefore = shouldBreakBeforeQuestion(index, settings.sectionMode);
        const applyGap = shouldApplyQuestionGap(index, settings.sectionMode);
        const isLast = index === groups.length - 1;

        return (
          <div
            key={order}
            className={[
              "print-question-wrap",
              breakBefore ? "print-break-before-page" : "",
              applyGap ? "print-question-gap" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <AnswerQuestionSection order={order} parts={parts} showEndMarker={isLast} />
          </div>
        );
      })}
    </PrintFlowDocument>
  );
}
