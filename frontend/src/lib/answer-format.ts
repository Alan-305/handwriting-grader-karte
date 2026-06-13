import type { AnswerFormatOptions, AnswerSheetFormat, QuestionType } from "@/types/firestore";

export const FORMAT_LABEL: Record<AnswerSheetFormat, string> = {
  japanese_grid: "日本語記述（マス目 20字×行）",
  underline: "下線部（和訳・和文英訳など）",
  english_composition: "自由英作文（下線＋語数）",
  short: "短答・記号（枠のみ）",
  composite: "総合問題（小問混在）",
};

export const DEFAULT_FORMAT: Record<QuestionType, AnswerSheetFormat> = {
  japanese: "japanese_grid",
  english: "underline",
  symbol: "short",
};

export const DEFAULT_OPTIONS: Record<AnswerSheetFormat, AnswerFormatOptions> = {
  japanese_grid: { gridRows: 5, gridCols: 20, charLimit: 100 },
  underline: { underlineLines: 3, underlineWidth: "long" },
  english_composition: { targetWords: 80, compositionLines: 10, compositionWidth: "long" },
  short: { symbolTableCount: 5, symbolTableHeader: "exam" },
  composite: {},
};

export interface ResolvedFormatOptions {
  gridRows: number;
  gridCols: number;
  charLimit?: number;
  underlineLines: number;
  underlineWidth: "short" | "medium" | "long";
  underlineWidthRatio: number;
  targetWords: number;
  compositionLines: number;
  compositionWidth: "short" | "medium" | "long";
  compositionWidthRatio: number;
}

export function resolveFormatOptions(
  format: AnswerSheetFormat,
  options?: AnswerFormatOptions,
): ResolvedFormatOptions {
  const base = DEFAULT_OPTIONS[format];
  const merged = { ...base, ...options };

  const targetWords = merged.targetWords ?? 80;
  const compositionLines =
    merged.compositionLines ?? Math.max(4, Math.ceil(targetWords / 8));

  const underlineWidth =
    merged.underlineWidth === "short" || merged.underlineWidth === "medium" || merged.underlineWidth === "long"
      ? merged.underlineWidth
      : "long";
  const underlineWidthRatio = underlineWidth === "short" ? 0.45 : underlineWidth === "medium" ? 0.7 : 1;
  const compositionWidth =
    merged.compositionWidth === "short" ||
    merged.compositionWidth === "medium" ||
    merged.compositionWidth === "long"
      ? merged.compositionWidth
      : "long";
  const compositionWidthRatio =
    compositionWidth === "short" ? 0.45 : compositionWidth === "medium" ? 0.7 : 1;

  return {
    gridRows: Math.max(1, Math.min(20, merged.gridRows ?? 5)),
    gridCols: Math.max(5, Math.min(40, merged.gridCols ?? 20)),
    charLimit: merged.charLimit,
    underlineLines: Math.max(1, Math.min(15, merged.underlineLines ?? 3)),
    underlineWidth,
    underlineWidthRatio,
    targetWords,
    compositionLines: Math.max(4, Math.min(20, compositionLines)),
    compositionWidth,
    compositionWidthRatio,
  };
}

export function resolveQuestionFormat(question: {
  type: QuestionType;
  answerFormat?: AnswerSheetFormat;
  formatOptions?: AnswerFormatOptions;
}): { format: AnswerSheetFormat; options: ResolvedFormatOptions } {
  const format = question.answerFormat ?? DEFAULT_FORMAT[question.type];
  return { format, options: resolveFormatOptions(format, question.formatOptions) };
}
