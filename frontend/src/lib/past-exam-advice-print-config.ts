import {
  DEFAULT_GRADING_PRINT_LAYOUT,
  gradingPrintDocumentStyle,
  migrateLayoutFromPartial,
  type GradingPrintLayoutSettings,
} from "@/lib/grading-print-config";

export type { GradingPrintLayoutSettings };

export type PastExamAdvicePrintSectionId =
  | "overallSummary"
  | "readinessVsExam"
  | "performanceSummary"
  | "pastExamConnection"
  | "studyAction"
  | "referencedPastQuestions"
  | "teacherTalkingPoints"
  | "adviceCards";

export type PastExamAdvicePrintSections = Record<PastExamAdvicePrintSectionId, boolean>;

export interface PastExamAdvicePrintPreferences {
  sections: PastExamAdvicePrintSections;
  layout: GradingPrintLayoutSettings;
  /** questionOrder をキーにした大問の印刷オン/オフ */
  includedQuestions: Record<string, boolean>;
}

export const PAST_EXAM_ADVICE_SECTION_LABELS: Record<PastExamAdvicePrintSectionId, string> = {
  overallSummary: "総評",
  readinessVsExam: "受験準備度（過去問との比較）",
  performanceSummary: "各大問のパフォーマンス要約",
  pastExamConnection: "過去問との関係",
  studyAction: "次の学習アクション",
  referencedPastQuestions: "参照した過去問",
  teacherTalkingPoints: "面談で伝える要点",
  adviceCards: "アドバイスカード",
};

export const DEFAULT_PAST_EXAM_ADVICE_SECTIONS: PastExamAdvicePrintSections = {
  overallSummary: true,
  readinessVsExam: true,
  performanceSummary: false,
  pastExamConnection: false,
  studyAction: false,
  referencedPastQuestions: false,
  teacherTalkingPoints: false,
  adviceCards: true,
};

const STORAGE_PREFIX = "past-exam-advice-print-prefs:";
const TEMPLATES_KEY = "past-exam-advice-print-templates:v1";

export interface PastExamAdvicePrintTemplate {
  id: string;
  name: string;
  sections: PastExamAdvicePrintSections;
  layout: GradingPrintLayoutSettings;
}

export { gradingPrintDocumentStyle, DEFAULT_GRADING_PRINT_LAYOUT };

export function adviceSectionOn(
  sections: PastExamAdvicePrintSections,
  id: PastExamAdvicePrintSectionId,
): boolean {
  return sections[id] !== false;
}

export function isAdviceQuestionIncluded(
  includedQuestions: Record<string, boolean>,
  questionOrder: number,
): boolean {
  const key = String(questionOrder);
  if (includedQuestions[key] === false) return false;
  return true;
}

export function loadPastExamAdvicePrintPreferences(): PastExamAdvicePrintPreferences {
  const defaults: PastExamAdvicePrintPreferences = {
    sections: { ...DEFAULT_PAST_EXAM_ADVICE_SECTIONS },
    layout: { ...DEFAULT_GRADING_PRINT_LAYOUT },
    includedQuestions: {},
  };
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PastExamAdvicePrintPreferences>;
    return {
      sections: { ...defaults.sections, ...parsed.sections },
      layout: migrateLayoutFromPartial(parsed.layout ?? {}),
      includedQuestions: parsed.includedQuestions ?? {},
    };
  } catch {
    return defaults;
  }
}

export function savePastExamAdvicePrintPreferences(prefs: PastExamAdvicePrintPreferences) {
  localStorage.setItem(
    STORAGE_PREFIX,
    JSON.stringify({
      ...prefs,
      layout: migrateLayoutFromPartial(prefs.layout),
    }),
  );
}

export function loadPastExamAdvicePrintTemplates(): PastExamAdvicePrintTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as PastExamAdvicePrintTemplate[]).map((t) => ({
      ...t,
      layout: migrateLayoutFromPartial(t.layout),
    }));
  } catch {
    return [];
  }
}

export function savePastExamAdvicePrintTemplates(templates: PastExamAdvicePrintTemplate[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

export const PAST_EXAM_ADVICE_PRINT_PRESETS: Array<{
  id: string;
  name: string;
  sections: PastExamAdvicePrintSections;
}> = [
  {
    id: "advice-compact",
    name: "標準（コンパクト）",
    sections: { ...DEFAULT_PAST_EXAM_ADVICE_SECTIONS },
  },
  {
    id: "advice-summary-only",
    name: "総評＋準備度のみ",
    sections: {
      ...DEFAULT_PAST_EXAM_ADVICE_SECTIONS,
      adviceCards: false,
    },
  },
  {
    id: "advice-cards-only",
    name: "カード中心",
    sections: {
      ...DEFAULT_PAST_EXAM_ADVICE_SECTIONS,
      overallSummary: false,
      readinessVsExam: false,
    },
  },
  {
    id: "advice-legacy-detail",
    name: "旧形式（大問別も含む）",
    sections: {
      overallSummary: true,
      readinessVsExam: true,
      performanceSummary: true,
      pastExamConnection: true,
      studyAction: true,
      referencedPastQuestions: true,
      teacherTalkingPoints: true,
      adviceCards: true,
    },
  },
];
