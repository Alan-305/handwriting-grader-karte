import { useEffect } from "react";
import type { RefObject } from "react";
import { printPreviewFromRef } from "@/lib/pdf-export";

export function usePrintShortcut(targetRef?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isPrintShortcut =
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "p";
      if (!isPrintShortcut) return;
      event.preventDefault();
      if (targetRef?.current) {
        printPreviewFromRef(targetRef);
      } else {
        window.print();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [targetRef]);
}
