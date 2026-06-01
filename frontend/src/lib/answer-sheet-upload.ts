/** 手書き答案アップロードの受け付け形式（フロント・バックエンドで整合） */

export const MAX_ANSWER_SHEET_PAGES = 4;

export const ANSWER_SHEET_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,application/pdf";

export function isAnswerSheetImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".bmp"].some((ext) =>
    name.endsWith(ext),
  );
}

export function isAnswerSheetPdfFile(file: File): boolean {
  if (file.type === "application/pdf") return true;
  return file.name.toLowerCase().endsWith(".pdf");
}

export function isAcceptedAnswerSheetFile(file: File): boolean {
  return isAnswerSheetImageFile(file) || isAnswerSheetPdfFile(file);
}

export function answerSheetFileKind(file: File): "image" | "pdf" {
  return isAnswerSheetPdfFile(file) ? "pdf" : "image";
}

/** 写真のみのときは枚数で上限。PDF 混在時はサーバー側でページ数を検証する。 */
export function mergeAnswerSheetFiles(current: File[], incoming: File[]): File[] {
  const accepted = incoming.filter(isAcceptedAnswerSheetFile);
  if (accepted.length === 0) return current;

  const merged = [...current, ...accepted];
  const onlyImages = merged.every(isAnswerSheetImageFile);
  if (onlyImages) {
    return merged.slice(0, MAX_ANSWER_SHEET_PAGES);
  }
  return merged;
}

export function formatAnswerSheetFileLabel(file: File): string {
  if (isAnswerSheetPdfFile(file)) {
    return "PDF";
  }
  return "写真";
}
