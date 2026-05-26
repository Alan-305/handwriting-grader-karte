/** 志望校マスタへ一括登録するよく使う大学・学部 */
export const UNIVERSITY_PRESETS: {
  name: string;
  faculty: string;
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  examTrends: string;
}[] = [
  {
    name: "東京大学",
    faculty: "文科一類",
    difficultyLevel: 5,
    examTrends: "英語・国語の読解力、論述。二次で小論文・面接あり。",
  },
  {
    name: "東京大学",
    faculty: "理科三類",
    difficultyLevel: 5,
    examTrends: "英語長文・和訳、数学・理科の基礎力。英語配点が高い。",
  },
  {
    name: "東京大学",
    faculty: "理科二類",
    difficultyLevel: 5,
    examTrends: "英語・数学・理科。理三より化学・生物比重が高い傾向。",
  },
  {
    name: "東京大学",
    faculty: "理科一類",
    difficultyLevel: 5,
    examTrends: "英語・数学・物理・化学中心。",
  },
  {
    name: "東京大学",
    faculty: "医学部",
    difficultyLevel: 5,
    examTrends: "英語・数学・理科。二次で小論文・面接。",
  },
  {
    name: "京都大学",
    faculty: "医学部",
    difficultyLevel: 5,
    examTrends: "英語・数学・理科。京大独自の英語傾向。",
  },
  {
    name: "大阪大学",
    faculty: "医学部",
    difficultyLevel: 5,
    examTrends: "英語・数学・理科。",
  },
  {
    name: "順天堂大学",
    faculty: "医学部",
    difficultyLevel: 4,
    examTrends: "英語・数学・理科。私立医学部標準。",
  },
  {
    name: "早稲田大学",
    faculty: "政治経済学部",
    difficultyLevel: 4,
    examTrends: "英語・国語・地歴公民。",
  },
  {
    name: "慶應義塾大学",
    faculty: "法学部",
    difficultyLevel: 4,
    examTrends: "英語・国語・地歴公民。",
  },
];
