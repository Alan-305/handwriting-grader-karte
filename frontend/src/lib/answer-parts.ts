import { DEFAULT_FORMAT, DEFAULT_OPTIONS } from "@/lib/answer-format";
import type {
  AnswerFormatOptions,
  AnswerPart,
  AnswerSheetFormat,
  CropRegion,
  Question,
  QuestionType,
} from "@/types/firestore";

export function partLabel(index: number): string {
  return `(${index})`;
}

export function createAnswerPart(
  question: Pick<Question, "type" | "answerFormat" | "formatOptions" | "cropRegion" | "modelAnswer">,
  index: number,
): AnswerPart {
  const answerFormat = question.answerFormat ?? DEFAULT_FORMAT[question.type];
  return {
    label: partLabel(index),
    answerFormat,
    formatOptions: { ...(question.formatOptions ?? DEFAULT_OPTIONS[answerFormat]) },
    modelAnswer: index === 1 ? question.modelAnswer ?? "" : "",
    cropRegion: { ...question.cropRegion },
  };
}

export function hasMultipleParts(question: Question): boolean {
  return (question.answerParts?.length ?? 0) > 1;
}

export function getAnswerPartCount(question: Question): number {
  const count = question.answerParts?.length ?? 0;
  return count > 0 ? count : 1;
}

/** 解答用紙レイアウト・crop 用に展開した解答欄単位 */
export interface AnswerUnit {
  questionOrder: number;
  partIndex: number;
  partLabel?: string;
  type: QuestionType;
  answerFormat: AnswerSheetFormat;
  formatOptions?: AnswerFormatOptions;
  cropRegion: CropRegion;
}

export function expandAnswerUnits(question: Question): AnswerUnit[] {
  if (question.answerParts && question.answerParts.length > 0) {
    return question.answerParts.map((part, partIndex) => ({
      questionOrder: question.order,
      partIndex,
      partLabel: part.label,
      type: question.type,
      answerFormat: part.answerFormat,
      formatOptions: part.formatOptions,
      cropRegion: part.cropRegion,
    }));
  }

  const answerFormat = question.answerFormat ?? DEFAULT_FORMAT[question.type];
  return [
    {
      questionOrder: question.order,
      partIndex: 0,
      type: question.type,
      answerFormat,
      formatOptions: question.formatOptions,
      cropRegion: question.cropRegion,
    },
  ];
}

export function applyLayoutCropRegions(
  questions: Question[],
  slots: Array<{ questionOrder: number; partIndex: number; cropRegion: CropRegion }>,
): Question[] {
  let slotIdx = 0;

  return questions.map((q) => {
    const unitCount = expandAnswerUnits(q).length;

    if (q.answerParts && q.answerParts.length > 0) {
      const answerParts = q.answerParts.map((part, i) => ({
        ...part,
        cropRegion: slots[slotIdx + i]?.cropRegion ?? part.cropRegion,
      }));
      slotIdx += unitCount;
      return { ...q, answerParts, cropRegion: answerParts[0]?.cropRegion ?? q.cropRegion };
    }

    const cropRegion = slots[slotIdx]?.cropRegion ?? q.cropRegion;
    slotIdx += unitCount;
    return { ...q, cropRegion };
  });
}

export function addAnswerPart(question: Question): Question {
  if (question.answerParts && question.answerParts.length > 0) {
    const nextIndex = question.answerParts.length + 1;
    return {
      ...question,
      answerParts: [...question.answerParts, createAnswerPart(question, nextIndex)],
    };
  }

  return {
    ...question,
    answerParts: [createAnswerPart(question, 1), createAnswerPart(question, 2)],
  };
}

export function removeAnswerPart(question: Question, partIndex: number): Question {
  if (!question.answerParts || question.answerParts.length <= 1) {
    const only = question.answerParts?.[0];
    return {
      ...question,
      answerParts: undefined,
      answerFormat: only?.answerFormat ?? question.answerFormat,
      formatOptions: only?.formatOptions ?? question.formatOptions,
      cropRegion: only?.cropRegion ?? question.cropRegion,
    };
  }

  const answerParts = question.answerParts
    .filter((_, i) => i !== partIndex)
    .map((part, i) => ({ ...part, label: partLabel(i + 1) }));

  if (answerParts.length === 1) {
    const only = answerParts[0];
    return {
      ...question,
      answerParts: undefined,
      answerFormat: only.answerFormat,
      formatOptions: only.formatOptions,
      cropRegion: only.cropRegion,
    };
  }

  return { ...question, answerParts };
}

export function updateAnswerPart(
  question: Question,
  partIndex: number,
  patch: Partial<AnswerPart>,
): Question {
  if (!question.answerParts?.length) return question;
  return {
    ...question,
    answerParts: question.answerParts.map((part, i) =>
      i === partIndex ? { ...part, ...patch } : part,
    ),
  };
}
