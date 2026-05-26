import { resolveQuestionFormat } from "@/lib/answer-format";
import { expandAnswerUnits, type AnswerUnit } from "@/lib/answer-parts";
import {
  DEFAULT_PRINT_LAYOUT_SETTINGS,
  shouldBreakBeforeQuestion,
  type PrintSectionMode,
} from "@/lib/print-layout-settings";
import type {
  AnswerFormatOptions,
  AnswerSheetFormat,
  CropRegion,
  Question,
  QuestionType,
} from "@/types/firestore";

export const A4_WIDTH = 2480;
export const A4_HEIGHT = 3508;
export const SHEET_MARGIN = 120;
export const SHEET_HEADER_HEIGHT = 200;
const MARGIN = SHEET_MARGIN;
const HEADER_HEIGHT = SHEET_HEADER_HEIGHT;
const GAP = 36;
const PART_GAP = 24;
const QUESTION_GAP = 36;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

const GRID_ROW_HEIGHT = 56;
const UNDERLINE_LINE_HEIGHT = 48;
const COMPOSITION_LINE_HEIGHT = 48;
const COMPOSITION_FOOTER = 64;
const SHORT_AREA_HEIGHT = 160;
const PART_LABEL_HEIGHT = 32;

export interface LayoutSlot {
  questionOrder: number;
  partIndex: number;
  partLabel?: string;
  slotKey: string;
  type: QuestionType;
  answerFormat: AnswerSheetFormat;
  formatOptions: AnswerFormatOptions;
  cropRegion: CropRegion;
  labelY: number;
}

export interface AnswerSheetLayout {
  pageWidth: number;
  pageHeight: number;
  alignmentMarks: Array<{ corner: "tl" | "tr" | "bl" | "br"; x: number; y: number }>;
  slots: LayoutSlot[];
}

function areaHeight(
  format: AnswerSheetFormat,
  options: ReturnType<typeof resolveQuestionFormat>["options"],
): number {
  switch (format) {
    case "japanese_grid":
      return options.gridRows * GRID_ROW_HEIGHT + 48;
    case "underline":
      return options.underlineLines * UNDERLINE_LINE_HEIGHT + 40;
    case "english_composition":
      return options.compositionLines * COMPOSITION_LINE_HEIGHT + COMPOSITION_FOOTER + 32;
    case "short":
    default:
      return SHORT_AREA_HEIGHT;
  }
}

function toLayoutSlot(
  unit: AnswerUnit,
  localY: number,
  pageIndex: number,
  hasMultiplePartsInQuestion: boolean,
  fieldHeight: number,
): LayoutSlot {
  const { format, options } = resolveQuestionFormat({
    type: unit.type,
    answerFormat: unit.answerFormat,
    formatOptions: unit.formatOptions,
  });
  const labelSpace = hasMultiplePartsInQuestion ? PART_LABEL_HEIGHT : 0;

  return {
    questionOrder: unit.questionOrder,
    partIndex: unit.partIndex,
    partLabel: hasMultiplePartsInQuestion ? unit.partLabel : undefined,
    slotKey: `${unit.questionOrder}-${unit.partIndex}`,
    type: unit.type,
    answerFormat: format,
    formatOptions: {
      gridRows: options.gridRows,
      charLimit: options.charLimit,
      underlineLines: options.underlineLines,
      targetWords: options.targetWords,
      compositionLines: options.compositionLines,
    },
    labelY: localY - 28,
    cropRegion: {
      x: MARGIN,
      y: localY + labelSpace,
      width: CONTENT_WIDTH,
      height: fieldHeight,
      pageIndex,
    },
  };
}

export function generateAnswerSheetLayout(
  questions: Question[],
  sectionMode: PrintSectionMode = DEFAULT_PRINT_LAYOUT_SETTINGS.sectionMode,
): AnswerSheetLayout {
  let pageIndex = 0;
  let localY = MARGIN + HEADER_HEIGHT;
  const pageBottom = () => A4_HEIGHT - MARGIN;
  const slots: LayoutSlot[] = [];

  for (let qIndex = 0; qIndex < questions.length; qIndex += 1) {
    const q = questions[qIndex];
    if (shouldBreakBeforeQuestion(qIndex, sectionMode)) {
      pageIndex += 1;
      localY = MARGIN;
    }

    const units = expandAnswerUnits(q);
    const hasMultiple = units.length > 1;

    for (let i = 0; i < units.length; i += 1) {
      if (i > 0) localY += PART_GAP;

      const unit = units[i];
      const { format, options } = resolveQuestionFormat({
        type: unit.type,
        answerFormat: unit.answerFormat,
        formatOptions: unit.formatOptions,
      });
      const fieldHeight = areaHeight(format, options);
      const labelSpace = hasMultiple ? PART_LABEL_HEIGHT : 0;
      const blockHeight = labelSpace + fieldHeight;

      if (localY + blockHeight > pageBottom()) {
        pageIndex += 1;
        localY = MARGIN;
      }

      slots.push(toLayoutSlot(unit, localY, pageIndex, hasMultiple, fieldHeight));
      localY += blockHeight;
    }

    localY += QUESTION_GAP;
  }

  return {
    pageWidth: A4_WIDTH,
    pageHeight: A4_HEIGHT,
    alignmentMarks: [
      { corner: "tl", x: 0, y: 0 },
      { corner: "tr", x: A4_WIDTH - 1, y: 0 },
      { corner: "br", x: A4_WIDTH - 1, y: A4_HEIGHT - 1 },
      { corner: "bl", x: 0, y: A4_HEIGHT - 1 },
    ],
    slots,
  };
}

/** レイアウト上の最大ページ数（0-indexed pageIndex + 1） */
/** 1枚目上部の氏名・解答時間欄（crop 対象外の目安） */
export function getHeaderExclusionRegion(pageIndex = 0): CropRegion {
  return {
    x: MARGIN,
    y: MARGIN,
    width: CONTENT_WIDTH,
    height: HEADER_HEIGHT,
    pageIndex,
  };
}

export function layoutPageCount(slots: LayoutSlot[]): number {
  if (slots.length === 0) return 1;
  return Math.max(...slots.map((s) => s.cropRegion.pageIndex ?? 0)) + 1;
}

export const TYPE_LABEL: Record<QuestionType, string> = {
  english: "英語",
  japanese: "日本語",
  symbol: "記号",
};

/** 印刷レイアウト用：大問ごとに小問スロットをグループ化 */
export function groupLayoutSlots(slots: LayoutSlot[]): Array<{ order: number; parts: LayoutSlot[] }> {
  const map = new Map<number, LayoutSlot[]>();
  for (const slot of slots) {
    const list = map.get(slot.questionOrder) ?? [];
    list.push(slot);
    map.set(slot.questionOrder, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([order, parts]) => ({ order, parts }));
}
