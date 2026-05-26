import type { AnswerFormat } from "@/types/past-exam";

export const ANSWER_FORMAT_OPTIONS: { value: AnswerFormat; label: string }[] = [
  { value: "japanese_writing", label: "日本語記述" },
  { value: "english_writing", label: "英語記述" },
  { value: "symbol", label: "記号" },
  { value: "composite", label: "総合問題" },
];

export const ANSWER_FORMAT_LABELS: Record<AnswerFormat, string> = {
  japanese_writing: "日本語記述",
  english_writing: "英語記述",
  symbol: "記号",
  composite: "総合問題",
};

/** 旧データ（answerFormat 未設定）向けの簡易推定 */
export function inferAnswerFormatFromPrompt(prompt: string): AnswerFormat {
  const symbolMarkers = ["マークシート", "記号をマーク", "一つ選び", "マークせよ"];
  const japaneseMarkers = ["日本語で", "字の日本語", "百字", "100字", "和訳", "要約"];
  const englishMarkers = ["語の英語", "英語で", "英訳", "並べ替え", "正しい順", "words"];

  const hasSymbol = symbolMarkers.some((m) => prompt.includes(m));
  const hasJapanese = japaneseMarkers.some((m) => prompt.includes(m));
  const hasEnglish = englishMarkers.some((m) => prompt.includes(m));

  if (hasSymbol && hasJapanese && hasEnglish) return "composite";
  if (hasSymbol && hasJapanese) return "composite";
  if (hasSymbol && hasEnglish) return "composite";
  if (hasSymbol) return "symbol";
  if (hasJapanese && hasEnglish) return "composite";
  if (hasJapanese) return "japanese_writing";
  if (hasEnglish) return "english_writing";
  return "english_writing";
}

export function resolveAnswerFormat(
  answerFormat: AnswerFormat | undefined,
  prompt: string,
): AnswerFormat {
  return answerFormat ?? inferAnswerFormatFromPrompt(prompt);
}
