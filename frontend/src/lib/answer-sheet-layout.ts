import { resolveQuestionFormat } from "@/lib/answer-format";
import { expandAnswerUnits, type AnswerUnit } from "@/lib/answer-parts";
import type {
  AnswerFormatOptions,
  AnswerSheetFormat,
  CropRegion,
  Question,
  QuestionType,
} from "@/types/firestore";

export const A4_WIDTH = 2480;
export const A4_HEIGHT = 3508;
const MARGIN = 120;
const HEADER_HEIGHT = 200;
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
  y: number,
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
    labelY: y - 28,
    cropRegion: {
      x: MARGIN,
      y: y + labelSpace,
      width: CONTENT_WIDTH,
      height: fieldHeight,
    },
  };
}

export function generateAnswerSheetLayout(questions: Question[]): AnswerSheetLayout {
  let y = MARGIN + HEADER_HEIGHT;
  const slots: LayoutSlot[] = [];

  for (const q of questions) {
    const units = expandAnswerUnits(q);
    const hasMultiple = units.length > 1;

    for (let i = 0; i < units.length; i += 1) {
      if (i > 0) y += PART_GAP;

      const unit = units[i];
      const { format, options } = resolveQuestionFormat({
        type: unit.type,
        answerFormat: unit.answerFormat,
        formatOptions: unit.formatOptions,
      });
      const fieldHeight = areaHeight(format, options);
      slots.push(toLayoutSlot(unit, y, hasMultiple, fieldHeight));
      y += (hasMultiple ? PART_LABEL_HEIGHT : 0) + fieldHeight;
    }

    y += QUESTION_GAP;
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
