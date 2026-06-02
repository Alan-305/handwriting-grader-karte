import { useEffect } from "react";
import type { RefObject } from "react";
import { printElement } from "@/lib/pdf-export";

export function usePrintShortcut(targetRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isPrintShortcut =
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "p";
      if (!isPrintShortcut) return;
      if (!targetRef.current) return;
      event.preventDefault();
      printElement(targetRef.current);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [targetRef]);
}
