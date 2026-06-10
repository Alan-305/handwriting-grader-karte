/** 模範解答テキストを印刷用セクションに分割する */

export interface ModelAnswerSections {
  /** 解答・解説本文（【重要語句】を含む場合あり） */
  body: string;
  /** 【重要語句】ブロック（抽出できた場合） */
  vocabulary: string;
  /** 全訳・全文和訳 */
  translation: string;
}

const TRANSLATION_MARKER = /(【全訳】|【全文和訳】)/;
const VOCABULARY_MARKER = /【重要語句】/;

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
