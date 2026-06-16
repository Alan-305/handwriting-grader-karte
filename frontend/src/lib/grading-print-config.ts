import type { CSSProperties } from "react";
import type { PrintPageMargin, PrintSectionMode } from "@/lib/print-layout-settings";

export type GradingPrintKind = "student" | "teacher";

export type StudentPrintSectionId =
  | "totalScore"
  | "grade"
  | "studentAnswer"
  | "feedback"
  | "explanation"
  | "contentEvaluation"
  | "grammarEvaluation"
  | "polishedAnswer"
  | "modelAnswer"
  | "modelAnswerTranslation"
  | "score";

export type TeacherPrintSectionId =
  | "grade"
  | "errorTags"
  | "feedback"
  | "teacherNotes"
  | "studentAnswer"
  | "explanation"
  | "contentEvaluation"
  | "grammarEvaluation"
  | "polishedAnswer"
  | "modelAnswer";

export type StudentPrintSections = Record<StudentPrintSectionId, boolean>;
export type TeacherPrintSections = Record<TeacherPrintSectionId, boolean>;

export interface GradingPrintLayoutSettings {
  sectionMode: PrintSectionMode;
  pageMargin: PrintPageMargin;
  questionGapMm: number;
  blockGapMm: number;
  fontScalePercent: number;
  lineHeight: number;
  /** custom モード: この order の大問の直前で改ページ（第1問は不可） */
  breakBeforeOrders?: number[];
}

export interface GradingPrintTemplate {
  id: string;
  name: string;
  kind: GradingPrintKind;
  sections: StudentPrintSections | TeacherPrintSections;
  layout: GradingPrintLayoutSettings;
}

export interface GradingPrintPreferences {
  sections: StudentPrintSections | TeacherPrintSections;
  layout: GradingPrintLayoutSettings;
  includedQuestions: Record<string, boolean>;
}

export const STUDENT_SECTION_LABELS: Record<StudentPrintSectionId, string> = {
  totalScore: "100点満点の合計",
  grade: "評価（優・良・不可）",
  studentAnswer: "あなたの解答",
  feedback: "講評・総評",
  explanation: "解説",
  contentEvaluation: "内容について",
  grammarEvaluation: "文法・語法・表現について",
  polishedAnswer: "完成版",
  modelAnswer: "模範解答",
  modelAnswerTranslation: "模範解答の全文和訳",
  score: "得点",
};

export const TEACHER_SECTION_LABELS: Record<TeacherPrintSectionId, string> = {
  grade: "評価（優・良・不可）",
  errorTags: "傾向タグ",
  feedback: "講評・総評",
  teacherNotes: "指導ポイント",
  studentAnswer: "生徒の解答（書き起こし）",
  explanation: "解説",
  contentEvaluation: "内容について",
  grammarEvaluation: "文法・語法・表現について",
  polishedAnswer: "完成版",
  modelAnswer: "模範解答",
};

export const DEFAULT_STUDENT_SECTIONS: StudentPrintSections = {
  totalScore: true,
  grade: true,
  studentAnswer: true,
  feedback: true,
  explanation: true,
  contentEvaluation: true,
  grammarEvaluation: true,
  polishedAnswer: true,
  modelAnswer: true,
  modelAnswerTranslation: true,
  score: true,
};

export const DEFAULT_TEACHER_SECTIONS: TeacherPrintSections = {
  grade: true,
  errorTags: true,
  feedback: true,
  teacherNotes: true,
  studentAnswer: true,
  explanation: true,
  contentEvaluation: true,
  grammarEvaluation: true,
  polishedAnswer: true,
  modelAnswer: false,
};

export const DEFAULT_GRADING_PRINT_LAYOUT: GradingPrintLayoutSettings = {
  sectionMode: "flow_all",
  pageMargin: "standard",
  questionGapMm: 10,
  blockGapMm: 4,
  fontScalePercent: 100,
  lineHeight: 1.55,
  breakBeforeOrders: [],
};

const STORAGE_PREFIX = "grading-print-prefs:";
const TEMPLATES_KEY = "grading-print-templates:v1";

export function clampMm(value: number, fallback: number, max = 30): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(0, Math.round(value)));
}

export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GRADING_PRINT_LAYOUT.fontScalePercent;
  return Math.min(120, Math.max(85, Math.round(value)));
}

export function clampLineHeight(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GRADING_PRINT_LAYOUT.lineHeight;
  return Math.min(1.9, Math.max(1.25, Math.round(value * 100) / 100));
}

export function gradingPrintDocumentStyle(layout: GradingPrintLayoutSettings): CSSProperties {
  return {
    "--print-question-gap": `${clampMm(layout.questionGapMm, DEFAULT_GRADING_PRINT_LAYOUT.questionGapMm, 50)}mm`,
    "--grading-print-block-gap": `${clampMm(layout.blockGapMm, DEFAULT_GRADING_PRINT_LAYOUT.blockGapMm)}mm`,
    "--grading-print-font-scale": `${clampFontScale(layout.fontScalePercent)}%`,
    "--grading-print-line-height": String(clampLineHeight(layout.lineHeight)),
  } as CSSProperties;
}

export function migrateLayoutFromPartial(
  raw: Partial<GradingPrintLayoutSettings>,
): GradingPrintLayoutSettings {
  const breakBeforeOrders = Array.isArray(raw.breakBeforeOrders)
    ? [...new Set(raw.breakBeforeOrders.map(Number))]
        .filter((n) => Number.isFinite(n) && n > 1)
        .sort((a, b) => a - b)
    : [];
  return {
    ...DEFAULT_GRADING_PRINT_LAYOUT,
    ...raw,
    questionGapMm: clampMm(
      raw.questionGapMm ?? DEFAULT_GRADING_PRINT_LAYOUT.questionGapMm,
      DEFAULT_GRADING_PRINT_LAYOUT.questionGapMm,
      50,
    ),
    blockGapMm: clampMm(
      raw.blockGapMm ?? DEFAULT_GRADING_PRINT_LAYOUT.blockGapMm,
      DEFAULT_GRADING_PRINT_LAYOUT.blockGapMm,
    ),
    fontScalePercent: clampFontScale(raw.fontScalePercent ?? DEFAULT_GRADING_PRINT_LAYOUT.fontScalePercent),
    lineHeight: clampLineHeight(raw.lineHeight ?? DEFAULT_GRADING_PRINT_LAYOUT.lineHeight),
    breakBeforeOrders,
  };
}

export function loadGradingPrintPreferences(kind: GradingPrintKind): GradingPrintPreferences {
  const defaults: GradingPrintPreferences = {
    sections: kind === "student" ? { ...DEFAULT_STUDENT_SECTIONS } : { ...DEFAULT_TEACHER_SECTIONS },
    layout: { ...DEFAULT_GRADING_PRINT_LAYOUT },
    includedQuestions: {},
  };
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${kind}`);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<GradingPrintPreferences>;
    return {
      sections: {
        ...defaults.sections,
        ...(parsed.sections as StudentPrintSections | TeacherPrintSections),
      },
      layout: migrateLayoutFromPartial(parsed.layout ?? {}),
      includedQuestions: parsed.includedQuestions ?? {},
    };
  } catch {
    return defaults;
  }
}

export function saveGradingPrintPreferences(kind: GradingPrintKind, prefs: GradingPrintPreferences) {
  localStorage.setItem(
    `${STORAGE_PREFIX}${kind}`,
    JSON.stringify({
      ...prefs,
      layout: migrateLayoutFromPartial(prefs.layout),
    }),
  );
}

export function loadGradingPrintTemplates(): GradingPrintTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as GradingPrintTemplate[];
    return list.map((t) => ({
      ...t,
      layout: migrateLayoutFromPartial(t.layout),
    }));
  } catch {
    return [];
  }
}

export function saveGradingPrintTemplates(templates: GradingPrintTemplate[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

export function isQuestionIncluded(
  includedQuestions: Record<string, boolean>,
  questionResultId: string,
): boolean {
  if (includedQuestions[questionResultId] === false) return false;
  return true;
}

export function studentSectionOn(sections: StudentPrintSections, id: StudentPrintSectionId): boolean {
  return sections[id] !== false;
}

export function teacherSectionOn(sections: TeacherPrintSections, id: TeacherPrintSectionId): boolean {
  return sections[id] !== false;
}

export const STUDENT_PRINT_PRESETS: Array<{
  id: string;
  name: string;
  sections: StudentPrintSections;
}> = [
  { id: "student-full", name: "すべて掲載", sections: { ...DEFAULT_STUDENT_SECTIONS } },
  {
    id: "student-return",
    name: "返却用（コンパクト）",
    sections: {
      ...DEFAULT_STUDENT_SECTIONS,
      contentEvaluation: false,
      grammarEvaluation: false,
      polishedAnswer: false,
      modelAnswer: false,
      modelAnswerTranslation: false,
      explanation: true,
      feedback: true,
    },
  },
  {
    id: "student-feedback-only",
    name: "講評・解説中心",
    sections: {
      ...DEFAULT_STUDENT_SECTIONS,
      studentAnswer: false,
      modelAnswer: false,
      modelAnswerTranslation: false,
      polishedAnswer: false,
      score: false,
      totalScore: false,
    },
  },
];

export const TEACHER_PRINT_PRESETS: Array<{
  id: string;
  name: string;
  sections: TeacherPrintSections;
}> = [
  { id: "teacher-full", name: "すべて掲載", sections: { ...DEFAULT_TEACHER_SECTIONS, modelAnswer: true } },
  {
    id: "teacher-coaching",
    name: "対面指導用",
    sections: {
      ...DEFAULT_TEACHER_SECTIONS,
      studentAnswer: true,
      modelAnswer: false,
      explanation: false,
      contentEvaluation: false,
      grammarEvaluation: false,
      polishedAnswer: false,
    },
  },
  {
    id: "teacher-detail",
    name: "詳細解説付き",
    sections: {
      ...DEFAULT_TEACHER_SECTIONS,
      modelAnswer: true,
      explanation: true,
      contentEvaluation: true,
      grammarEvaluation: true,
      polishedAnswer: true,
    },
  },
];
