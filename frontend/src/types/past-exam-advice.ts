import type { AdviceCard } from "./firestore";

export interface QuestionPastExamInsight {
  questionOrder: number;
  matchedTypeLabel: string;
  performanceSummary: string;
  pastExamConnection: string;
  studyAction: string;
  referencedPastQuestions: string[];
}

export interface SessionPastExamAdvice {
  overallSummary: string;
  universitySlug: string;
  readinessVsExam: string;
  questionInsights: QuestionPastExamInsight[];
  teacherTalkingPoints: string[];
  adviceCards: AdviceCard[];
  generatedAt?: string;
}
