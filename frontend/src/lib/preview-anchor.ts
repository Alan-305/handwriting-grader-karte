/** 編集欄 data-preview-anchor とプレビュー DOM id の対応 */

export function previewAnchorId(anchor: string): string {
  return `preview-${anchor.replace(/:/g, "--")}`;
}

export function questionAnchor(questionId: string): string {
  return `q:${questionId}`;
}

export function questionPromptAnchor(questionId: string): string {
  return `q:${questionId}:prompt`;
}

export function questionPassageAnchor(questionId: string): string {
  return `q:${questionId}:passage`;
}

export function questionUnitAnchor(questionId: string, unitKey: string): string {
  return `q:${questionId}:unit:${unitKey}`;
}

export function questionOrderAnchor(order: number): string {
  return `qo:${order}`;
}

export function resultAnchor(resultId: string): string {
  return `r:${resultId}`;
}

export function resultFieldAnchor(resultId: string, field: string): string {
  return `r:${resultId}:${field}`;
}

export function adviceSummaryAnchor(): string {
  return "advice:summary";
}

export function adviceReadinessAnchor(): string {
  return "advice:readiness";
}

export function adviceCardAnchor(index: number): string {
  return `advice:card:${index}`;
}

export function adviceQuestionAnchor(questionOrder: number): string {
  return `advice:q:${questionOrder}`;
}

/** フォーカス先から data-preview-anchor を取得 */
export function readPreviewAnchor(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null;
  const field = target.closest("[data-preview-anchor]");
  if (field instanceof HTMLElement) {
    return field.getAttribute("data-preview-anchor");
  }
  return target.getAttribute("data-preview-anchor");
}

/** より具体的なアンカーから親ブロックへフォールバック */
export function previewAnchorFallbacks(anchor: string): string[] {
  const list = [anchor];
  const parts = anchor.split(":");
  if (parts[0] === "q" && parts.length >= 2) {
    list.push(`q:${parts[1]}`);
  }
  if (parts[0] === "r" && parts.length >= 2) {
    list.push(`r:${parts[1]}`);
  }
  if (parts[0] === "advice" && parts[1] === "card" && parts[2] !== undefined) {
    list.push("advice:summary");
  }
  if (parts[0] === "advice" && parts[1] === "q" && parts[2] !== undefined) {
    list.push(`advice:q:${parts[2]}`);
  }
  return [...new Set(list)];
}
