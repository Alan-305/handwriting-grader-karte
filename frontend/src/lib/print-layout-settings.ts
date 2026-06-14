import type { CSSProperties } from "react";

export type PrintSectionMode = "split_first" | "flow_all" | "one_per_question" | "custom";

export type PrintPageMargin = "standard" | "wide";

export interface PrintLayoutSettings {
  sectionMode: PrintSectionMode;
  /** 大問と大問の間隔（mm） */
  questionGapMm: number;
  pageMargin: PrintPageMargin;
  /** custom モード: この order の大問の直前で改ページ（第1問は不可） */
  breakBeforeOrders?: number[];
  /** 印刷全体の文字サイズ（85〜120%） */
  fontScalePercent: number;
  /** 本文の行間（1.25〜1.9） */
  lineHeight: number;
}

export const DEFAULT_PRINT_LAYOUT_SETTINGS: PrintLayoutSettings = {
  sectionMode: "split_first",
  questionGapMm: 12,
  pageMargin: "standard",
  breakBeforeOrders: [],
  fontScalePercent: 100,
  lineHeight: 1.55,
};

export const SECTION_MODE_LABEL: Record<PrintSectionMode, string> = {
  split_first: "第1問を独立（第2問以降は別ページから）",
  flow_all: "すべて流し込み（スペースが足りれば同じページ）",
  one_per_question: "大問ごとに改ページ",
  custom: "大問ごとに指定（チェックで改ページ位置を選ぶ）",
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

export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PRINT_LAYOUT_SETTINGS.fontScalePercent;
  return Math.min(120, Math.max(85, Math.round(value)));
}

export function clampLineHeight(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PRINT_LAYOUT_SETTINGS.lineHeight;
  return Math.min(1.9, Math.max(1.25, Math.round(value * 100) / 100));
}

export function printLayoutDocumentStyle(settings: PrintLayoutSettings): CSSProperties {
  return {
    "--print-question-gap": `${clampQuestionGapMm(settings.questionGapMm)}mm`,
    "--print-font-scale": `${clampFontScale(settings.fontScalePercent)}%`,
    "--print-line-height": String(clampLineHeight(settings.lineHeight)),
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
  settings.fontScalePercent = clampFontScale(
    settings.fontScalePercent ?? DEFAULT_PRINT_LAYOUT_SETTINGS.fontScalePercent,
  );
  settings.lineHeight = clampLineHeight(
    settings.lineHeight ?? DEFAULT_PRINT_LAYOUT_SETTINGS.lineHeight,
  );
  if (!Array.isArray(settings.breakBeforeOrders)) {
    settings.breakBeforeOrders = [];
  } else {
    settings.breakBeforeOrders = [...new Set(settings.breakBeforeOrders.map(Number))]
      .filter((n) => Number.isFinite(n) && n > 1)
      .sort((a, b) => a - b);
  }
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
      fontScalePercent: clampFontScale(settings.fontScalePercent),
      lineHeight: clampLineHeight(settings.lineHeight),
      breakBeforeOrders: (settings.breakBeforeOrders ?? [])
        .filter((n) => Number.isFinite(n) && n > 1)
        .sort((a, b) => a - b),
    }),
  );
}

type LayoutBreakSettings = Pick<PrintLayoutSettings, "sectionMode" | "breakBeforeOrders">;

/** 各大問の前に改ページを入れるか（groupIndex=0 は常に false） */
export function shouldBreakBeforeQuestion(
  groupIndex: number,
  questionOrder: number,
  settings: LayoutBreakSettings,
): boolean {
  if (groupIndex === 0) return false;
  const { sectionMode, breakBeforeOrders = [] } = settings;
  if (sectionMode === "flow_all") return false;
  if (sectionMode === "one_per_question") return true;
  if (sectionMode === "custom") return breakBeforeOrders.includes(questionOrder);
  return groupIndex === 1;
}

/** 大問間余白（mm）を適用するか */
export function shouldApplyQuestionGap(
  groupIndex: number,
  settings: LayoutBreakSettings,
): boolean {
  if (groupIndex === 0) return false;
  if (settings.sectionMode === "split_first") return groupIndex >= 2;
  return true;
}

export function toggleBreakBeforeOrder(
  settings: PrintLayoutSettings,
  questionOrder: number,
  enabled: boolean,
): PrintLayoutSettings {
  if (questionOrder <= 1) return settings;
  const current = settings.breakBeforeOrders ?? [];
  const breakBeforeOrders = enabled
    ? [...new Set([...current, questionOrder])].sort((a, b) => a - b)
    : current.filter((o) => o !== questionOrder);
  return { ...settings, breakBeforeOrders };
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
