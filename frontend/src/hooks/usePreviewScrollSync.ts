import { useEffect, type RefObject } from "react";
import { syncPreviewFromEditorTarget } from "@/lib/preview-scroll-sync";

/** 左ペインのフォーカス・カーソルに合わせて右プレビューをスクロール */
export function usePreviewScrollSync(
  editorRef: RefObject<HTMLElement | null>,
  previewScrollRef: RefObject<HTMLElement | null>,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const editor = editorRef.current;
    const scroll = previewScrollRef.current;
    if (!editor || !scroll) return;

    let raf = 0;
    const schedule = (target: EventTarget | null) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        syncPreviewFromEditorTarget(scroll, target);
      });
    };

    const onFocusIn = (e: FocusEvent) => schedule(e.target);
    const onClick = (e: MouseEvent) => schedule(e.target);
    const onKeyUp = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLTextAreaElement && t.hasAttribute("data-preview-anchor")) {
        schedule(t);
      }
    };
    const onSelect = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLTextAreaElement && t.hasAttribute("data-preview-anchor")) {
        schedule(t);
      }
    };

    editor.addEventListener("focusin", onFocusIn);
    editor.addEventListener("click", onClick);
    editor.addEventListener("keyup", onKeyUp);
    editor.addEventListener("select", onSelect);
    return () => {
      cancelAnimationFrame(raf);
      editor.removeEventListener("focusin", onFocusIn);
      editor.removeEventListener("click", onClick);
      editor.removeEventListener("keyup", onKeyUp);
      editor.removeEventListener("select", onSelect);
    };
  }, [editorRef, previewScrollRef, enabled]);
}
