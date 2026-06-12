import { useEffect, type RefObject } from "react";
import { syncPreviewFromEditorTarget } from "@/lib/preview-scroll-sync";

/** 左ペインのフォーカス・カーソルに合わせて右プレビューをスクロール */
export function usePreviewScrollSync(
  editorRef: RefObject<HTMLElement | null>,
  previewScrollEl: HTMLElement | null,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled || !previewScrollEl) return;

    let raf = 0;
    const schedule = (target: EventTarget | null) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          syncPreviewFromEditorTarget(previewScrollEl, target);
        });
      });
    };

    const onFocusIn = (e: FocusEvent) => {
      const editor = editorRef.current;
      if (!editor?.contains(e.target as Node)) return;
      schedule(e.target);
    };
    const onClick = (e: MouseEvent) => {
      const editor = editorRef.current;
      if (!editor?.contains(e.target as Node)) return;
      schedule(e.target);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLTextAreaElement)) return;
      const editor = editorRef.current;
      if (!editor?.contains(t) || !t.hasAttribute("data-preview-anchor")) return;
      schedule(t);
    };
    const onSelect = (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLTextAreaElement)) return;
      const editor = editorRef.current;
      if (!editor?.contains(t) || !t.hasAttribute("data-preview-anchor")) return;
      schedule(t);
    };

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keyup", onKeyUp, true);
    document.addEventListener("select", onSelect, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("select", onSelect, true);
    };
  }, [editorRef, previewScrollEl, enabled]);
}
