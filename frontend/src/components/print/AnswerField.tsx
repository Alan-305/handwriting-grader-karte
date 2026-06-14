import { resolveFormatOptions } from "@/lib/answer-format";
import type { AnswerFormatOptions, AnswerSheetFormat } from "@/types/firestore";

const ANSWER_SHEET_LINE = "#334155";
const ANSWER_SHEET_CELL_HEIGHT = "7.5mm";

function JapaneseGridField({
  gridRows,
  gridCols,
  charLimit,
}: {
  gridRows: number;
  gridCols: number;
  charLimit?: number;
}) {
  return (
    <div className="answer-sheet-japanese-grid-wrap space-y-1 print:px-0">
      {charLimit != null && charLimit > 0 && (
        <p className="font-ja text-[10px] text-slate-500">
          {charLimit}字以内（1行{gridCols}字）
        </p>
      )}
      <table
        className="answer-sheet-japanese-grid w-full"
        style={{
          borderCollapse: "collapse",
          tableLayout: "fixed",
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          border: `1px solid ${ANSWER_SHEET_LINE}`,
        }}
      >
        <tbody>
          {Array.from({ length: gridRows }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: gridCols }, (_, col) => (
                <td
                  key={col}
                  aria-hidden
                  style={{
                    border: `1px solid ${ANSWER_SHEET_LINE}`,
                    height: ANSWER_SHEET_CELL_HEIGHT,
                    padding: 0,
                    background: "#fff",
                  }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnderlineField({ lines, widthRatio }: { lines: number; widthRatio: number }) {
  return (
    <div
      className="answer-sheet-field space-y-0 rounded border bg-white px-2 py-3 print:px-0"
      style={{
        width: `${Math.round(widthRatio * 100)}%`,
        maxWidth: "100%",
        boxSizing: "border-box",
        borderColor: ANSWER_SHEET_LINE,
        borderWidth: "1px",
      }}
    >
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="border-b"
          style={{
            borderColor: ANSWER_SHEET_LINE,
            minHeight: "9mm",
            marginBottom: i < lines - 1 ? "2mm" : 0,
          }}
        />
      ))}
    </div>
  );
}

function EnglishCompositionField({
  lines,
  targetWords,
  widthRatio,
}: {
  lines: number;
  targetWords: number;
  widthRatio: number;
}) {
  return (
    <div
      className="answer-sheet-field rounded border bg-white px-2 py-3 print:px-0"
      style={{
        width: `${Math.round(widthRatio * 100)}%`,
        maxWidth: "100%",
        boxSizing: "border-box",
        borderColor: ANSWER_SHEET_LINE,
        borderWidth: "1px",
      }}
    >
      <div className="space-y-0">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className="border-b"
            style={{
              borderColor: ANSWER_SHEET_LINE,
              minHeight: "9mm",
              marginBottom: i < lines - 1 ? "2mm" : 0,
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 font-ja text-xs text-slate-600">
        <span className="font-en">（</span>
        <span
          className="inline-block min-w-[12mm] border-b"
          style={{ borderColor: ANSWER_SHEET_LINE }}
          aria-hidden
        />
        <span className="font-en">語）</span>
        <span className="ml-2 font-ja text-[10px] text-slate-400">
          目安 {targetWords}語
        </span>
      </div>
    </div>
  );
}

function ShortField() {
  return (
    <div
      className="answer-sheet-field rounded bg-white"
      style={{
        minHeight: "24mm",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        border: `2px solid ${ANSWER_SHEET_LINE}`,
      }}
    />
  );
}

export function AnswerField({
  format,
  formatOptions,
}: {
  format: AnswerSheetFormat;
  formatOptions?: AnswerFormatOptions;
}) {
  const resolved = resolveFormatOptions(format, formatOptions);

  switch (format) {
    case "japanese_grid":
      return (
        <JapaneseGridField
          gridRows={resolved.gridRows}
          gridCols={resolved.gridCols}
          charLimit={resolved.charLimit}
        />
      );
    case "underline":
      return (
        <UnderlineField
          lines={resolved.underlineLines}
          widthRatio={resolved.underlineWidthRatio}
        />
      );
    case "english_composition":
      return (
        <EnglishCompositionField
          lines={resolved.compositionLines}
          targetWords={resolved.targetWords}
          widthRatio={resolved.compositionWidthRatio}
        />
      );
    case "short":
    default:
      return <ShortField />;
  }
}
