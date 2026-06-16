/** 手書き答案アップロードの受け付け形式（フロント・バックエンドで整合） */

export const MAX_ANSWER_SHEET_PAGES = 4;

export const ANSWER_SHEET_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf";

const PDF_MIME_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/acrobat",
  "application/vnd.pdf",
]);

export function isAnswerSheetImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".bmp"].some((ext) =>
    name.endsWith(ext),
  );
}

export function isAnswerSheetPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return true;
  const type = (file.type || "").toLowerCase();
  return PDF_MIME_TYPES.has(type);
}

/** DataTransfer から File 一覧を取り出す（Safari 等で files が空のとき items を使う） */
export function filesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const fromFiles = Array.from(dataTransfer.files ?? []);
  if (fromFiles.length > 0) return fromFiles;
  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file != null);
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
