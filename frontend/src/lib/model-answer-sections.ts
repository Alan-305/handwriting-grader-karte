import type { Question } from "@/types/firestore";

/** 模範解答テキストを印刷用セクションに分割する */

export interface ModelAnswerSections {
  /** 解答・解説本文（【重要語句】を含む場合あり） */
  body: string;
  /** 【重要語句】ブロック（抽出できた場合） */
  vocabulary: string;
  /** 全訳・全文和訳（見出し行を含む） */
  translation: string;
}

const TRANSLATION_MARKER = /(【全訳】|【全文和訳】)/;
const VOCABULARY_MARKER = /【重要語句】/;

/** 問題文に英語の本文が含まれるか（第1問・第3問など長文読解・要約向け） */
export function questionHasEnglishPassage(question: Question): boolean {
  if (question.type !== "english") return false;
  const prompt = question.prompt ?? "";
  const latin = (prompt.match(/[a-zA-Z]/g) || []).length;
  if (latin < 40) return false;
  const cjk = (prompt.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length;
  return latin >= 80 || latin > cjk;
}

export function translationBody(text: string): string {
  return text
    .replace(/^【全訳】\s*/m, "")
    .replace(/^【全文和訳】\s*/m, "")
    .trim();
}

export function splitModelAnswerSections(text: string): ModelAnswerSections {
  if (!text.trim()) {
    return { body: "", vocabulary: "", translation: "" };
  }

  let remainder = text.trim();
  let translation = "";

  const transHit = TRANSLATION_MARKER.exec(remainder);
  if (transHit && transHit.index >= 0) {
    translation = remainder.slice(transHit.index).trim();
    remainder = remainder.slice(0, transHit.index).trim();
  }

  let vocabulary = "";
  const vocabHit = VOCABULARY_MARKER.exec(remainder);
  if (vocabHit && vocabHit.index >= 0) {
    vocabulary = remainder.slice(vocabHit.index).trim();
    remainder = remainder.slice(0, vocabHit.index).trim();
  }

  return {
    body: remainder,
    vocabulary,
    translation,
  };
}

export function unitHeading(order: number, partLabel?: string): string {
  return partLabel ? `第${order}問 ${partLabel}` : `第${order}問`;
}

/** 解答・解説と全訳を modelAnswer 1本にまとめる */
export function mergeModelAnswerSections(
  answerBody: string,
  passageTranslation: string,
): string {
  const trimmedBody = answerBody.trim();
  const trimmedTrans = passageTranslation.trim();
  const parts: string[] = [];
  if (trimmedBody) parts.push(trimmedBody);
  if (trimmedTrans) parts.push(`【全訳】\n${trimmedTrans}`);
  return parts.join("\n\n");
}

/** 模範解答から解答・解説部分だけ（全訳・重要語句は残す） */
export function answerBodyWithoutPassageTranslation(text: string): string {
  const { body, vocabulary } = splitModelAnswerSections(text);
  const chunks = [body, vocabulary].filter((s) => s.trim());
  return chunks.join("\n\n");
}

/** 設問群から本文全訳を抽出（小問がある場合は最初に見つかったもの） */
export function extractPassageTranslation(
  question: Question,
  modelAnswers: string[],
): string {
  for (const raw of modelAnswers) {
    const { translation } = splitModelAnswerSections(raw);
    if (translation.trim()) return translationBody(translation);
  }
  return questionHasEnglishPassage(question) ? "" : "";
}
