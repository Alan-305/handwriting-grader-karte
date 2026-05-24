import { useEffect, useState } from "react";
import {
  DEFAULT_PRINT_LAYOUT_SETTINGS,
  loadPrintLayoutSettings,
  savePrintLayoutSettings,
  type PrintLayoutSettings,
} from "@/lib/print-layout-settings";

export function usePrintLayoutSettings(testId: string | undefined) {
  const [settings, setSettings] = useState<PrintLayoutSettings>(DEFAULT_PRINT_LAYOUT_SETTINGS);

  useEffect(() => {
    if (!testId) return;
    setSettings(loadPrintLayoutSettings(testId));
  }, [testId]);

  useEffect(() => {
    if (!testId) return;
    savePrintLayoutSettings(testId, settings);
  }, [testId, settings]);

  const reset = () => setSettings(DEFAULT_PRINT_LAYOUT_SETTINGS);

  return { settings, setSettings, reset };
}
