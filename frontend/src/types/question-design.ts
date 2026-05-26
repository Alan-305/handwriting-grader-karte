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
  status?: "draft" | "promoted";
  difficulty?: string;
  topicHint?: string;
  createdAt?: string;
}

export interface GenerateQuestionsResponse {
  batchId: string;
  draftIds: string[];
  questions: GeneratedQuestionDraft[];
}
