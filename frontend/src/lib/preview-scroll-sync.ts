import { previewAnchorFallbacks, previewAnchorId, readPreviewAnchor } from "@/lib/preview-anchor";

export function caretLineRatio(textarea: HTMLTextAreaElement): number {
  const before = textarea.value.slice(0, textarea.selectionStart);
  const lineIndex = before.split("\n").length - 1;
  const totalLines = Math.max(1, textarea.value.split("\n").length);
  return lineIndex / totalLines;
}

function findPreviewElement(scrollRoot: HTMLElement, anchor: string): HTMLElement | null {
  for (const candidate of previewAnchorFallbacks(anchor)) {
    const el = scrollRoot.querySelector(`#${CSS.escape(previewAnchorId(candidate))}`);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

/** プレビュースクロール領域内でアンカー位置へ追従（textarea は行位置も考慮） */
export function scrollPreviewToAnchor(
  scrollRoot: HTMLElement,
  anchor: string,
  lineRatio = 0,
): void {
  const target = findPreviewElement(scrollRoot, anchor);
  if (!target) return;

  const rootRect = scrollRoot.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const innerOffset = target.offsetHeight * Math.min(1, Math.max(0, lineRatio)) * 0.9;
  const top =
    targetRect.top - rootRect.top + scrollRoot.scrollTop + innerOffset - 56;

  scrollRoot.scrollTo({
    top: Math.max(0, top),
    behavior: "smooth",
  });
}

export function syncPreviewFromEditorTarget(
  scrollRoot: HTMLElement,
  target: EventTarget | null,
): void {
  const anchor = readPreviewAnchor(target);
  if (!anchor) return;
  const lineRatio =
    target instanceof HTMLTextAreaElement ? caretLineRatio(target) : 0;
  scrollPreviewToAnchor(scrollRoot, anchor, lineRatio);
}
