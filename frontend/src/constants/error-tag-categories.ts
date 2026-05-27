/** カルテ・添削で使う一般化ミス傾向カテゴリ（問題固有の文言は含めない） */
export const GENERALIZED_ERROR_CATEGORIES = [
  "語彙ミス",
  "スペルミス",
  "訳し漏れ",
  "時制ミス",
  "文構造の誤り",
  "構造把握の弱さ",
  "指示未達",
  "構成の弱さ",
  "表記・記号",
  "具体性不足",
  "語順・表現",
  "その他",
] as const;

const RULES: { keywords: string[]; category: (typeof GENERALIZED_ERROR_CATEGORIES)[number] }[] = [
  { keywords: ["訳し漏れ", "訳抜け", "訳漏", "抜け", "漏訳"], category: "訳し漏れ" },
  { keywords: ["スペル", "綴り"], category: "スペルミス" },
  { keywords: ["語彙", "単語"], category: "語彙ミス" },
  { keywords: ["時制", "過去形", "未来形", "完了形"], category: "時制ミス" },
  { keywords: ["文構造", "構文", "倒置", "二重否定"], category: "文構造の誤り" },
  { keywords: ["構造把握", "論旨", "主旨", "読解"], category: "構造把握の弱さ" },
  { keywords: ["構成", "段落"], category: "構成の弱さ" },
  { keywords: ["指示未達", "語数", "字数", "要約"], category: "指示未達" },
  {
    keywords: ["具体性", "言及", "自己抑制", "テーマ", "内容不足", "論点"],
    category: "具体性不足",
  },
  { keywords: ["語順", "不自然", "ぎこち", "表現"], category: "語順・表現" },
  { keywords: ["表記", "記号"], category: "表記・記号" },
  { keywords: ["文法"], category: "文構造の誤り" },
];

export function normalizeErrorTagLabel(raw: string): string {
  let label = (raw ?? "").trim();
  if (!label) return "その他";
  for (const sep of ["（", "("]) {
    const idx = label.indexOf(sep);
    if (idx >= 0) {
      label = label.slice(0, idx).trim();
      break;
    }
  }
  return label || "その他";
}

export function categorizeErrorTag(raw: string): string {
  const label = normalizeErrorTagLabel(raw);
  if ((GENERALIZED_ERROR_CATEGORIES as readonly string[]).includes(label)) {
    return label;
  }
  const compact = label.replace(/\s/g, "");
  for (const { keywords, category } of RULES) {
    if (keywords.some((kw) => label.includes(kw) || compact.includes(kw))) {
      return category;
    }
  }
  return "その他";
}
