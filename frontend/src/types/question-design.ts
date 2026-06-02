export type CoverageLevel = "sufficient" | "partial" | "insufficient";

export interface RevisionSuggestion {
  field: string;
  currentExcerpt: string;
  proposedText: string;
  reason: string;
}

export interface QuestionValidityItem {
  questionOrder: number;
  matchedTypeLabel: string;
  coverage: CoverageLevel;
  coverageLabel?: string;
  summary: string;
  improvements: string[];
  referencedPastQuestions: string[];
  revisionSuggestions: RevisionSuggestion[];
}

export interface ValidityReport {
  overallSummary: string;
  universitySlug: string;
  items: QuestionValidityItem[];
  checkedAt?: string;
}

export interface QuestionTypeCatalogItem {
  majorOrder: number;
  partLabel?: string | null;
  typeLabel: string;
  years: number[];
  sampleQuestionIds: string[];
}

/** UI 用の生成単位（第5問は1枠に集約など） */
export interface GenerationUnit {
  majorOrder: number;
  partLabel?: string | null;
  typeLabel: string;
  unitKey: string;
  years: number[];
  sampleQuestionIds: string[];
  catalogKeys: string[];
  pipeline: "q5" | "q4a" | "q4b" | "q1a" | "q1b" | "q2a" | "q2b" | "generic";
}

export interface Q5GenerationArtifacts {
  passage?: string;
  passageTitle?: string;
  fullTranslationJa?: string;
  evaluatorPassed?: boolean;
  evaluatorIssues?: string[];
  evaluatorSummary?: string;
  retriedQuestions?: boolean;
  retriedProblem?: boolean;
  themeSummary?: string;
  layout?: string;
  items?: unknown[];
}

export interface GeneratedQuestionDraft {
  id?: string;
  batchId?: string;
  teacherId?: string;
  universitySlug: string;
  typeLabel: string;
  majorOrder: number;
  partLabel?: string | null;
  prompt: string;
  modelAnswer: string;
  points: number;
  type: string;
  answerFormat?: string | null;
  notes?: string;
  referenceExamples?: string[];
  /** 生徒がしがちな想定誤答（採点・指導の準備用） */
  anticipatedMistakes?: string[];
  status?: "draft" | "promoted";
  difficulty?: string;
  topicHint?: string;
  createdAt?: string;
  generationPipeline?: "q5" | string;
  generationArtifacts?: Q5GenerationArtifacts;
}

export interface GenerateQuestionsResponse {
  batchId: string;
  draftIds: string[];
  questions: GeneratedQuestionDraft[];
}

/** ② セット下書き（複数問＋自動検証込み） */
export interface TestDraftSet {
  id: string;
  teacherId?: string;
  title: string;
  universitySlug: string;
  studentId?: string;
  studentName?: string;
  /** カルテ由来の弱点フォーカス（生徒指定時のみ） */
  weaknessFocus?: string;
  difficulty?: string;
  topicHint?: string;
  referenceYears?: number[];
  status?: "draft" | "promoted";
  reviewStatus?: "draft" | "confirmed";
  questions: GeneratedQuestionDraft[];
  questionCount: number;
  totalPoints: number;
  /** 自動で実行した妥当性検証の結果（過去問が無い場合は null） */
  validityReport?: ValidityReport | null;
  /** 検証で不足が出たため1回再生成したか */
  autoRetried?: boolean;
  createdAt?: string;
}

export interface BuildTestDraftBody {
  selections: Array<{ majorOrder: number; partLabel?: string | null; typeLabel?: string }>;
  referenceYears?: number[];
  difficulty?: string;
  topicHint?: string;
  countPerType?: number;
  studentId?: string;
  title?: string;
}
