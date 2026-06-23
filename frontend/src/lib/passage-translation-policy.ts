import { questionHasEnglishPassage } from "@/lib/model-answer-sections";
import type { Question } from "@/types/firestore";
import type { GeneratedQuestionDraft } from "@/types/question-design";

/** 大学別生成パイプライン上、本文全訳が通常不要な型 */
const PIPELINE_NO_AI_PASSAGE_TRANSLATION = new Set(["q1b", "q2a", "q2b", "q4b"]);

export type PassageTranslationQuestionLike = {
  type?: string;
  prompt?: string;
  answerFormat?: string | null;
  generationPipeline?: string | null;
};

function promptIsWabunEibun(prompt: string): boolean {
  if (!prompt.trim()) return false;
  if (!/下線部を英訳|和文.*下線|日本文.*下線|日本語文.*下線/.test(prompt)) return false;
  const latin = (prompt.match(/[a-zA-Z]/g) || []).length;
  const cjk = (prompt.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length;
  return cjk >= latin;
}

function promptIsEnglishUnderlineToJa(prompt: string): boolean {
  return (
    /下線部.{0,24}日本語|日本語に訳|和訳せよ/.test(prompt) &&
    !/誤り|不適切/.test(prompt)
  );
}

function promptIsComposition(prompt: string, answerFormat?: string | null): boolean {
  if (answerFormat === "english_composition") return true;
  if (/英作文|自由英作/.test(prompt)) return true;
  if (/\d+\s*語/.test(prompt) && /書きなさい|書け/.test(prompt)) return true;
  const lowered = prompt.toLowerCase();
  return lowered.includes("words") && (lowered.includes("write") || lowered.includes("compose"));
}

export function toPassageTranslationQuestionLike(
  source: Question | GeneratedQuestionDraft,
): PassageTranslationQuestionLike {
  return {
    type: source.type,
    prompt: source.prompt,
    answerFormat: "answerFormat" in source ? source.answerFormat : undefined,
    generationPipeline: source.generationPipeline,
  };
}

/** AI 全訳生成 API が受け付けそうか（ボタンは全訳欄があれば常に表示） */
export function isPassageTranslationTarget(source: PassageTranslationQuestionLike): boolean {
  const prompt = source.prompt ?? "";
  if (promptIsWabunEibun(prompt)) return false;

  const latin = (prompt.match(/[a-zA-Z]/g) || []).length;
  if (latin >= 40 && source.type === "english") return true;

  const questionLike: Question = {
    id: "check",
    order: 1,
    type: (source.type as Question["type"]) ?? "english",
    prompt,
    modelAnswer: "",
    points: 1,
    cropRegion: { x: 0, y: 0, width: 0, height: 0 },
  };
  return questionHasEnglishPassage(questionLike);
}

/** @deprecated use isPassageTranslationTarget */
export function isAiPassageTranslationRecommended(
  source: PassageTranslationQuestionLike,
): boolean {
  return isPassageTranslationTarget(source);
}

/** @deprecated use isAiPassageTranslationRecommended */
export function supportsPassageTranslation(
  source: Question | GeneratedQuestionDraft,
): boolean {
  return isAiPassageTranslationRecommended(toPassageTranslationQuestionLike(source));
}

/** 下書き画面で全訳欄を出すか（既存入力 or 英語本文あり） */
export function shouldShowPassageTranslationSection(
  source: Question | GeneratedQuestionDraft,
  existingTranslation = "",
): boolean {
  if (existingTranslation.trim()) return true;
  return isPassageTranslationTarget(toPassageTranslationQuestionLike(source));
}
