import { useEffect } from "react";
import type { RefObject } from "react";
import { printElement } from "@/lib/pdf-export";
import { printDocument } from "@/lib/print-layout-settings";

export function usePrintShortcut(targetRef?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isPrintShortcut =
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "p";
      if (!isPrintShortcut) return;
      event.preventDefault();
      if (targetRef?.current) {
        printElement(targetRef.current);
      } else {
        printDocument();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [targetRef]);
}
