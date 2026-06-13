/** カルテ・添削で使う一般化ミス傾向カテゴリ（重大→軽微の順） */
export const GENERALIZED_ERROR_CATEGORIES = [
  "誤情報の混入",
  "該当箇所のズレ",
  "内容説明不足",
  "句・節の把握ミス",
  "修飾先の取り違え",
  "文構造の誤り",
  "時制・仮定法・助動詞",
  "誤訳・脱訳",
  "語彙ミス",
  "選択の誤り",
  "スペルミス",
  "その他",
] as const;

/** 棒グラフ等: 重大度順（小さいほど重大） */
export function errorCategorySeverityIndex(category: string): number {
  const idx = (GENERALIZED_ERROR_CATEGORIES as readonly string[]).indexOf(category);
  return idx >= 0 ? idx : GENERALIZED_ERROR_CATEGORIES.length;
}

const LEGACY_CATEGORY_MAP: Record<string, (typeof GENERALIZED_ERROR_CATEGORIES)[number]> = {
  訳し漏れ: "誤訳・脱訳",
  時制ミス: "時制・仮定法・助動詞",
  具体性不足: "内容説明不足",
  構造把握の弱さ: "句・節の把握ミス",
  構成の弱さ: "内容説明不足",
  "語順・表現": "文構造の誤り",
  構文の取り違え: "文構造の誤り",
  "表記・記号": "選択の誤り",
  指示未達: "その他",
};

const RULES: { keywords: string[]; category: (typeof GENERALIZED_ERROR_CATEGORIES)[number] }[] = [
  { keywords: ["誤情報", "誤った情報", "事実誤認", "混入"], category: "誤情報の混入" },
  { keywords: ["該当箇所", "根拠段落", "本文のズレ", "引用箇所"], category: "該当箇所のズレ" },
  {
    keywords: ["内容説明", "説明不足", "具体性", "言及", "論点", "内容不足", "論述"],
    category: "内容説明不足",
  },
  { keywords: ["時制", "仮定法", "助動詞", "過去形", "完了形"], category: "時制・仮定法・助動詞" },
  { keywords: ["修飾", "係り受け", "修飾先"], category: "修飾先の取り違え" },
  { keywords: ["句", "節", "構造把握", "論旨"], category: "句・節の把握ミス" },
  {
    keywords: ["構文", "言い換え", "語順", "不自然", "ぎこち", "文構造", "倒置", "文法"],
    category: "文構造の誤り",
  },
  { keywords: ["誤訳", "脱訳", "訳し漏れ", "訳抜け", "訳漏", "漏訳"], category: "誤訳・脱訳" },
  { keywords: ["スペル", "綴り"], category: "スペルミス" },
  { keywords: ["語彙", "単語"], category: "語彙ミス" },
  { keywords: ["語数", "字数", "要約"], category: "内容説明不足" },
  { keywords: ["選択", "記号", "空所", "表記"], category: "選択の誤り" },
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
  if (label in LEGACY_CATEGORY_MAP) {
    return LEGACY_CATEGORY_MAP[label];
  }
  const compact = label.replace(/\s/g, "");
  for (const { keywords, category } of RULES) {
    if (keywords.some((kw) => label.includes(kw) || compact.includes(kw))) {
      return category;
    }
  }
  return "その他";
}
