import { useEffect } from "react";
import type { RefObject } from "react";
import { printDocument } from "@/lib/print-layout-settings";

export function usePrintShortcut(_targetRef?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isPrintShortcut =
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "p";
      if (!isPrintShortcut) return;
      event.preventDefault();
      printDocument();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
