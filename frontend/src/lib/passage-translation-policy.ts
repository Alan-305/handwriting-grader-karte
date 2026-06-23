import { questionHasEnglishPassage } from "@/lib/model-answer-sections";
import type { Question } from "@/types/firestore";
import type { GeneratedQuestionDraft } from "@/types/question-design";

const EXCLUDED_PIPELINES = new Set(["q2a", "q2b"]);
const EXCLUDED_MAJOR_ORDERS = new Set([3]);

export type PassageTranslationTarget = {
  order?: number;
  majorOrder?: number;
  partLabel?: string | null;
  generationPipeline?: string | null;
};

function normalizePartLabel(partLabel?: string | null): string {
  if (!partLabel) return "";
  const match = partLabel.match(/[A-Za-zＡ-Ｚａ-ｚ]/);
  return match ? match[0].toUpperCase() : "";
}

export function isExcludedFromPassageTranslation(
  target: PassageTranslationTarget,
): boolean {
  const pipeline = (target.generationPipeline ?? "").toLowerCase();
  if (EXCLUDED_PIPELINES.has(pipeline)) return true;

  const order = target.order ?? target.majorOrder ?? 0;
  if (EXCLUDED_MAJOR_ORDERS.has(order)) return true;

  if (order === 2) {
    const part = normalizePartLabel(target.partLabel);
    if (part === "A" || part === "B") return true;
  }

  return false;
}

export function toPassageTranslationTarget(
  source: Question | GeneratedQuestionDraft,
): PassageTranslationTarget {
  if ("majorOrder" in source && source.majorOrder != null) {
    return {
      majorOrder: source.majorOrder,
      partLabel: source.partLabel,
      generationPipeline: source.generationPipeline,
    };
  }
  const question = source as Question;
  return {
    order: question.order,
    partLabel: null,
    generationPipeline: question.generationPipeline,
  };
}

export function supportsPassageTranslation(
  source: Question | GeneratedQuestionDraft,
): boolean {
  if (isExcludedFromPassageTranslation(toPassageTranslationTarget(source))) {
    return false;
  }
  const prompt = source.prompt ?? "";
  const questionLike: Question = {
    id: "id" in source && source.id ? source.id : "draft",
    order: "order" in source ? source.order : source.majorOrder,
    type: source.type as Question["type"],
    prompt,
    modelAnswer: source.modelAnswer ?? "",
    points: source.points,
    cropRegion: { x: 0, y: 0, width: 0, height: 0 },
  };
  return questionHasEnglishPassage(questionLike);
}
