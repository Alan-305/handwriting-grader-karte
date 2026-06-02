import { resolveFormatOptions } from "@/lib/answer-format";
import type { AnswerFormatOptions, AnswerSheetFormat } from "@/types/firestore";

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
    <div className="space-y-1">
      {charLimit != null && charLimit > 0 && (
        <p className="font-ja text-[10px] text-slate-500">
          {charLimit}字以内（1行{gridCols}字）
        </p>
      )}
      <div
        className="grid border border-slate-400"
        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: gridRows * gridCols }, (_, i) => (
          <div
            key={i}
            className="aspect-square border border-slate-300 bg-white"
            style={{ minHeight: "7.5mm" }}
          />
        ))}
      </div>
    </div>
  );
}

function UnderlineField({ lines, widthRatio }: { lines: number; widthRatio: number }) {
  return (
    <div
      className="space-y-0 rounded border border-slate-400 bg-white px-2 py-3"
      style={{ width: `${Math.round(widthRatio * 100)}%` }}
    >
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="border-b border-slate-400"
          style={{ minHeight: "9mm", marginBottom: i < lines - 1 ? "2mm" : 0 }}
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
      className="rounded border border-slate-400 bg-white px-2 py-3"
      style={{ width: `${Math.round(widthRatio * 100)}%` }}
    >
      <div className="space-y-0">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className="border-b border-slate-400"
            style={{ minHeight: "9mm", marginBottom: i < lines - 1 ? "2mm" : 0 }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 font-ja text-xs text-slate-600">
        <span className="font-en">（</span>
        <span
          className="inline-block min-w-[12mm] border-b border-slate-500"
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
      className="rounded border-2 border-slate-400 bg-white"
      style={{ minHeight: "24mm" }}
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
