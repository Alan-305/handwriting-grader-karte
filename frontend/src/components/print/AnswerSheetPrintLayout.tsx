import { groupLayoutSlots, type LayoutSlot } from "@/lib/answer-sheet-layout";
import { PreviewAnchor } from "@/components/print/PreviewAnchor";
import {
  printLayoutDocumentStyle,
  shouldApplyQuestionGap,
  shouldBreakBeforeQuestion,
  type PrintLayoutSettings,
} from "@/lib/print-layout-settings";
import { questionAnchor, questionOrderAnchor } from "@/lib/preview-anchor";
import { DEFAULT_OPTIONS } from "@/lib/answer-format";
import { AnswerField } from "@/components/print/AnswerField";
import { PrintFixedCornerMarks, PrintFlowDocument } from "@/components/print/PrintA4Page";
import type { AnswerFormatOptions } from "@/types/firestore";

const ANSWER_SHEET_LINE = "#334155";

function buildSymbolHeaderLabels(
  count: number,
  style: "numeric" | "alpha" | "exam",
): string[] {
  const n = Math.max(3, Math.min(8, count));
  if (style === "alpha") {
    return Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i));
  }
  if (style === "numeric") {
    return Array.from({ length: n }, (_, i) => String(i + 1));
  }
  return Array.from({ length: n }, (_, i) => `(${21 + i})`);
}

function SymbolTableField({ formatOptions }: { formatOptions?: AnswerFormatOptions }) {
  const rows = buildSymbolHeaderLabels(
    formatOptions?.symbolTableCount ?? 5,
    formatOptions?.symbolTableHeader ?? "exam",
  );
  return (
    <div className="bg-white px-1 py-1 print:px-0">
      <table
        className="answer-sheet-symbol-table w-full border-collapse"
        style={{ tableLayout: "fixed", borderCollapse: "collapse" }}
      >
        <thead>
          <tr className="bg-slate-50">
            {rows.map((label) => (
              <th
                key={label}
                className="py-1 text-center font-en text-[11px] font-medium text-slate-700"
                style={{ border: `1px solid ${ANSWER_SHEET_LINE}` }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {rows.map((label) => (
              <td
                key={label}
                className="align-middle"
                style={{
                  border: `1px solid ${ANSWER_SHEET_LINE}`,
                  height: "16mm",
                }}
              >
                <div className="h-full w-full" />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="px-2 pt-2 text-center font-ja text-[10px] text-slate-500">
        各欄に A〜E を1つ記入
      </p>
    </div>
  );
}

function shouldUseSymbolTable(slot: LayoutSlot, order: number): boolean {
  // 後方互換: 第4問(A) は従来どおり強制的に表形式
  if (order === 4 && (slot.partLabel ?? "").toUpperCase() === "(A)") return true;
  // 新仕様: short 形式で列数指定がある場合はどの大問でも表形式
  if (slot.answerFormat !== "short") return false;
  const count = Number(
    slot.formatOptions?.symbolTableCount ?? DEFAULT_OPTIONS.short.symbolTableCount ?? 5,
  );
  return count >= 3;
}

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
    <section className="print-question-block print-question-block--split-ok">
      <p className="mb-3 font-ja text-base font-semibold">第{order}問</p>
      <div className={parts.length > 1 ? "space-y-4" : undefined}>
        {parts.map((slot) => (
          <div
            key={slot.slotKey}
            className={shouldUseSymbolTable(slot, order) ? "print-break-avoid" : undefined}
          >
            {slot.partLabel && (
              <p className="mb-1 font-ja text-xs font-medium text-slate-700">{slot.partLabel}</p>
            )}
            {shouldUseSymbolTable(slot, order) ? (
              <SymbolTableField formatOptions={slot.formatOptions} />
            ) : (
              <AnswerField format={slot.answerFormat} formatOptions={slot.formatOptions} />
            )}
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
  questionIdByOrder,
}: {
  testTitle: string;
  slots: LayoutSlot[];
  settings: PrintLayoutSettings;
  /** 設問 order → Firestore id（プレビュー連動用） */
  questionIdByOrder?: Record<number, string>;
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
        const breakBefore = shouldBreakBeforeQuestion(index, order, settings);
        const applyGap = shouldApplyQuestionGap(index, settings);
        const isLast = index === groups.length - 1;

        const syncAnchor = questionIdByOrder?.[order]
          ? questionAnchor(questionIdByOrder[order])
          : questionOrderAnchor(order);

        return (
          <PreviewAnchor
            key={order}
            anchor={syncAnchor}
            className={[
              "print-question-wrap",
              breakBefore ? "print-break-before-page" : "",
              applyGap ? "print-question-gap" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <AnswerQuestionSection order={order} parts={parts} showEndMarker={isLast} />
          </PreviewAnchor>
        );
      })}
    </PrintFlowDocument>
  );
}
