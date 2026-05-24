import type { CSSProperties } from "react";

export type PrintSectionMode = "split_first" | "flow_all" | "one_per_question";

export type PrintPageMargin = "standard" | "wide";

export interface PrintLayoutSettings {
  sectionMode: PrintSectionMode;
  /** 大問と大問の間隔（mm） */
  questionGapMm: number;
  pageMargin: PrintPageMargin;
}

export const DEFAULT_PRINT_LAYOUT_SETTINGS: PrintLayoutSettings = {
  sectionMode: "split_first",
  questionGapMm: 12,
  pageMargin: "standard",
};

export const SECTION_MODE_LABEL: Record<PrintSectionMode, string> = {
  split_first: "第1問を独立（第2問以降は別ページから）",
  flow_all: "すべて流し込み（スペースが足りれば同じページ）",
  one_per_question: "大問ごとに改ページ",
};

export const PAGE_MARGIN_LABEL: Record<PrintPageMargin, string> = {
  standard: "標準（上下20mm・左右24mm）",
  wide: "やや広め",
};

const STORAGE_PREFIX = "print-layout-settings:";
const LEGACY_TEST_PAPER_PREFIX = "print-settings:test-paper:";

export function clampQuestionGapMm(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PRINT_LAYOUT_SETTINGS.questionGapMm;
  return Math.min(50, Math.max(0, Math.round(value)));
}

export function printLayoutDocumentStyle(settings: PrintLayoutSettings): CSSProperties {
  return {
    "--print-question-gap": `${clampQuestionGapMm(settings.questionGapMm)}mm`,
  } as CSSProperties;
}

function migrateLegacy(raw: Record<string, unknown>): PrintLayoutSettings {
  const settings: PrintLayoutSettings = {
    ...DEFAULT_PRINT_LAYOUT_SETTINGS,
    ...(raw as Partial<PrintLayoutSettings>),
  };

  if (typeof raw.questionGap === "string") {
    const legacyGap: Record<string, number> = { sm: 5, md: 8, lg: 12 };
    settings.questionGapMm = legacyGap[raw.questionGap] ?? settings.questionGapMm;
  }

  settings.questionGapMm = clampQuestionGapMm(settings.questionGapMm);
  return settings;
}

export function loadPrintLayoutSettings(testId: string): PrintLayoutSettings {
  try {
    const current = localStorage.getItem(`${STORAGE_PREFIX}${testId}`);
    if (current) return migrateLegacy(JSON.parse(current));

    const legacy = localStorage.getItem(`${LEGACY_TEST_PAPER_PREFIX}${testId}`);
    if (legacy) return migrateLegacy(JSON.parse(legacy));
  } catch {
    /* ignore */
  }
  return DEFAULT_PRINT_LAYOUT_SETTINGS;
}

export function savePrintLayoutSettings(testId: string, settings: PrintLayoutSettings) {
  localStorage.setItem(
    `${STORAGE_PREFIX}${testId}`,
    JSON.stringify({
      ...settings,
      questionGapMm: clampQuestionGapMm(settings.questionGapMm),
    }),
  );
}

/** 各大問の前に改ページを入れるか */
export function shouldBreakBeforeQuestion(index: number, mode: PrintSectionMode): boolean {
  if (index === 0) return false;
  if (mode === "flow_all") return false;
  if (mode === "one_per_question") return true;
  return index === 1;
}

/** 大問間余白（mm）を適用するか — split_first では第2問以降の間のみ */
export function shouldApplyQuestionGap(index: number, mode: PrintSectionMode): boolean {
  if (index === 0) return false;
  if (mode === "split_first") return index >= 2;
  return true;
}

/** 印刷時にブラウザ PDF ヘッダーへタイトルを出さない */
export function printDocument() {
  const previousTitle = document.title;
  document.title = "";
  window.print();
  window.addEventListener(
    "afterprint",
    () => {
      document.title = previousTitle;
    },
    { once: true },
  );
}
