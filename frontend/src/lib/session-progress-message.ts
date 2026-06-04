import type { GradingProgress } from "@/types/firestore";

/** Firestore の gradingProgress をローディング表示用テキストに変換 */
export function formatGradingProgressMessage(
  progress: GradingProgress | null | undefined,
): string | null {
  if (!progress) return null;
  const { current, total, message } = progress;
  if (total <= 1) return message;
  return `${message}（${current + 1}/${total}）`;
}
