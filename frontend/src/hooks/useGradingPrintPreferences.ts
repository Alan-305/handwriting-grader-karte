import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_GRADING_PRINT_LAYOUT,
  DEFAULT_STUDENT_SECTIONS,
  DEFAULT_TEACHER_SECTIONS,
  loadGradingPrintPreferences,
  loadGradingPrintTemplates,
  saveGradingPrintPreferences,
  saveGradingPrintTemplates,
  type GradingPrintKind,
  type GradingPrintLayoutSettings,
  type GradingPrintPreferences,
  type GradingPrintTemplate,
  type StudentPrintSections,
  type TeacherPrintSections,
} from "@/lib/grading-print-config";

export function useGradingPrintPreferences(kind: GradingPrintKind) {
  const [prefs, setPrefs] = useState<GradingPrintPreferences>(() =>
    loadGradingPrintPreferences(kind),
  );
  const [templates, setTemplates] = useState<GradingPrintTemplate[]>(() =>
    loadGradingPrintTemplates(),
  );

  useEffect(() => {
    setPrefs(loadGradingPrintPreferences(kind));
  }, [kind]);

  useEffect(() => {
    saveGradingPrintPreferences(kind, prefs);
  }, [kind, prefs]);

  const setSections = useCallback(
    (sections: StudentPrintSections | TeacherPrintSections) => {
      setPrefs((p) => ({ ...p, sections }));
    },
    [],
  );

  const setLayout = useCallback((layout: GradingPrintLayoutSettings) => {
    setPrefs((p) => ({ ...p, layout }));
  }, []);

  const setQuestionIncluded = useCallback((resultId: string, included: boolean) => {
    setPrefs((p) => ({
      ...p,
      includedQuestions: {
        ...p.includedQuestions,
        [resultId]: included,
      },
    }));
  }, []);

  const resetLayout = useCallback(() => {
    setPrefs((p) => ({ ...p, layout: { ...DEFAULT_GRADING_PRINT_LAYOUT } }));
  }, []);

  const resetSections = useCallback(() => {
    setPrefs((p) => ({
      ...p,
      sections:
        kind === "student"
          ? { ...DEFAULT_STUDENT_SECTIONS }
          : { ...DEFAULT_TEACHER_SECTIONS },
    }));
  }, [kind]);

  const saveTemplate = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const template: GradingPrintTemplate = {
        id: `${kind}-${Date.now()}`,
        name: trimmed,
        kind,
        sections: { ...prefs.sections } as StudentPrintSections | TeacherPrintSections,
        layout: { ...prefs.layout },
      };
      const next = [...templates.filter((t) => t.name !== trimmed || t.kind !== kind), template];
      setTemplates(next);
      saveGradingPrintTemplates(next);
    },
    [kind, prefs.layout, prefs.sections, templates],
  );

  const applyTemplate = useCallback(
    (templateId: string) => {
      const t = templates.find((x) => x.id === templateId);
      if (!t || t.kind !== kind) return;
      setPrefs((p) => ({
        ...p,
        sections: { ...t.sections },
        layout: { ...t.layout },
      }));
    },
    [kind, templates],
  );

  const deleteTemplate = useCallback((templateId: string) => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== templateId);
      saveGradingPrintTemplates(next);
      return next;
    });
  }, []);

  return {
    prefs,
    setPrefs,
    setSections,
    setLayout,
    setQuestionIncluded,
    resetLayout,
    resetSections,
    templates: templates.filter((t) => t.kind === kind),
    saveTemplate,
    applyTemplate,
    deleteTemplate,
  };
}
