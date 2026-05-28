import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_GRADING_PRINT_LAYOUT,
  DEFAULT_PAST_EXAM_ADVICE_SECTIONS,
  loadPastExamAdvicePrintPreferences,
  loadPastExamAdvicePrintTemplates,
  savePastExamAdvicePrintPreferences,
  savePastExamAdvicePrintTemplates,
  type GradingPrintLayoutSettings,
  type PastExamAdvicePrintPreferences,
  type PastExamAdvicePrintSections,
  type PastExamAdvicePrintTemplate,
} from "@/lib/past-exam-advice-print-config";

export function usePastExamAdvicePrintPreferences() {
  const [prefs, setPrefs] = useState<PastExamAdvicePrintPreferences>(() =>
    loadPastExamAdvicePrintPreferences(),
  );
  const [templates, setTemplates] = useState<PastExamAdvicePrintTemplate[]>(() =>
    loadPastExamAdvicePrintTemplates(),
  );

  useEffect(() => {
    savePastExamAdvicePrintPreferences(prefs);
  }, [prefs]);

  const setSections = useCallback((sections: PastExamAdvicePrintSections) => {
    setPrefs((p) => ({ ...p, sections }));
  }, []);

  const setLayout = useCallback((layout: GradingPrintLayoutSettings) => {
    setPrefs((p) => ({ ...p, layout }));
  }, []);

  const setQuestionIncluded = useCallback((questionOrder: number, included: boolean) => {
    setPrefs((p) => ({
      ...p,
      includedQuestions: {
        ...p.includedQuestions,
        [String(questionOrder)]: included,
      },
    }));
  }, []);

  const resetLayout = useCallback(() => {
    setPrefs((p) => ({ ...p, layout: { ...DEFAULT_GRADING_PRINT_LAYOUT } }));
  }, []);

  const resetSections = useCallback(() => {
    setPrefs((p) => ({ ...p, sections: { ...DEFAULT_PAST_EXAM_ADVICE_SECTIONS } }));
  }, []);

  const saveTemplate = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const template: PastExamAdvicePrintTemplate = {
        id: `advice-${Date.now()}`,
        name: trimmed,
        sections: { ...prefs.sections },
        layout: { ...prefs.layout },
      };
      const next = [...templates.filter((t) => t.name !== trimmed), template];
      setTemplates(next);
      savePastExamAdvicePrintTemplates(next);
    },
    [prefs.layout, prefs.sections, templates],
  );

  const applyTemplate = useCallback(
    (templateId: string) => {
      const t = templates.find((x) => x.id === templateId);
      if (!t) return;
      setPrefs((p) => ({
        ...p,
        sections: { ...t.sections },
        layout: { ...t.layout },
      }));
    },
    [templates],
  );

  const deleteTemplate = useCallback((templateId: string) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== templateId);
      savePastExamAdvicePrintTemplates(next);
      return next;
    });
  }, []);

  return {
    prefs,
    setSections,
    setLayout,
    setQuestionIncluded,
    resetLayout,
    resetSections,
    templates,
    saveTemplate,
    applyTemplate,
    deleteTemplate,
  };
}
