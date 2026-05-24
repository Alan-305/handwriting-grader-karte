import type { AnswerFormatOptions, AnswerSheetFormat, QuestionType } from "@/types/firestore";

export const FORMAT_LABEL: Record<AnswerSheetFormat, string> = {
  japanese_grid: "日本語記述（マス目 20字×行）",
  underline: "下線部（和訳・和文英訳など）",
  english_composition: "自由英作文（下線＋語数）",
  short: "短答・記号（枠のみ）",
};

export const DEFAULT_FORMAT: Record<QuestionType, AnswerSheetFormat> = {
  japanese: "japanese_grid",
  english: "underline",
  symbol: "short",
};

export const DEFAULT_OPTIONS: Record<AnswerSheetFormat, AnswerFormatOptions> = {
  japanese_grid: { gridRows: 5, charLimit: 100 },
  underline: { underlineLines: 3 },
  english_composition: { targetWords: 80, compositionLines: 10 },
  short: {},
};

export interface ResolvedFormatOptions {
  gridRows: number;
  charLimit?: number;
  underlineLines: number;
  targetWords: number;
  compositionLines: number;
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

  return {
    gridRows: Math.max(1, Math.min(20, merged.gridRows ?? 5)),
    charLimit: merged.charLimit,
    underlineLines: Math.max(1, Math.min(15, merged.underlineLines ?? 3)),
    targetWords,
    compositionLines: Math.max(4, Math.min(20, compositionLines)),
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
