/** 共通テスト科目（AI・集計用の固定キー） */
export type CommonTestSubjectId =
  | "englishReading"
  | "englishListening"
  | "math1"
  | "math2"
  | "japanese"
  | "science1"
  | "science2"
  | "geographyHistoryCivics"
  | "information";

export const COMMON_TEST_SUBJECTS: { id: CommonTestSubjectId; label: string }[] = [
  { id: "englishReading", label: "英語（リーディング）" },
  { id: "englishListening", label: "英語（リスニング）" },
  { id: "math1", label: "数学①" },
  { id: "math2", label: "数学②" },
  { id: "japanese", label: "国語" },
  { id: "science1", label: "理科①" },
  { id: "science2", label: "理科②" },
  { id: "geographyHistoryCivics", label: "地歴公民" },
  { id: "information", label: "情報" },
];

/** 得点帯・状態（プルダウン用。自由入力を避け AI が誤読しにくくする） */
export const COMMON_TEST_SCORE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "未入力" },
  { value: "not_taken", label: "未受験" },
  { value: "pending", label: "未発表・未定" },
  { value: "under_40", label: "40点未満" },
  { value: "40_49", label: "40〜49点" },
  { value: "50_59", label: "50〜59点" },
  { value: "60_69", label: "60〜69点" },
  { value: "70_79", label: "70〜79点" },
  { value: "80_89", label: "80〜89点" },
  { value: "90_99", label: "90〜99点" },
  { value: "100", label: "100点" },
];

export const COMMON_TEST_YEAR_OPTIONS = () => {
  const y = new Date().getFullYear();
  return [y + 1, y, y - 1, y - 2].map((year) => ({ value: String(year), label: `${year}年度` }));
};

/** 面談で確定した事項（複数選択） */
export const CONFIRMED_FACT_OPTIONS: { id: string; label: string }[] = [
  { id: "med_school", label: "医学部（国公立・私立）を志望" },
  { id: "todai_sci_3", label: "東京大学理科三類を志望" },
  { id: "todai_lit_1", label: "東京大学文科一類を志望" },
  { id: "todai_sci_general", label: "東京大学理科系（理三以外）を志望" },
  { id: "todai_lit_general", label: "東京大学文科系（文一以外）を志望" },
  { id: "kyutei_sci", label: "旧帝大理系（東大以外）を志望" },
  { id: "kyutei_lit", label: "旧帝大文系を志望" },
  { id: "waseda_keio", label: "早慶上智クラスを志望" },
  { id: "current_senior", label: "現役高校3年" },
  { id: "ronin", label: "浪人生" },
  { id: "english_focus", label: "英語対策を最優先" },
  { id: "common_test_primary", label: "共通テスト利用入試が中心" },
  { id: "secondary_only", label: "二次・個別学力試験が中心" },
  { id: "no_other_faculty", label: "上記志望以外の学部・入試区分は話さない（面談合意）" },
];

export const COURSE_OPTIONS = [
  "医学部受験コース",
  "難関大理系コース",
  "難関大文系コース",
  "総合型・小論文重視コース",
  "その他",
] as const;

export function scoreBandLabel(value: string): string {
  return COMMON_TEST_SCORE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function confirmedFactLabel(id: string): string {
  return CONFIRMED_FACT_OPTIONS.find((o) => o.id === id)?.label ?? id;
}
