import type { PastExamParseDraft } from "./past-exam";

export interface UploadSessionResponse {
  sessionId: string;
  sourceImagePath: string;
  sourceImagePaths?: string[];
  pageCount?: number;
}

export interface GradeSessionResponse {
  sessionId: string;
  totalScore: number;
  results: Array<Record<string, unknown>>;
}

export interface SessionProgressResponse {
  status: string;
  gradingProgress?: {
    current: number;
    total: number;
    message: string;
  };
  totalScore: number;
}

export interface AnalyzeStudentResponse {
  id: string;
  weaknessSummary: string;
  errorFrequency: Record<string, number>;
  adviceCards: Array<{
    title: string;
    body: string;
    category: string;
    priority: string;
  }>;
  readinessComment: string;
}

export interface PastExamImportResponse {
  sessionId: string;
  universitySlug: string;
  universityName: string;
  year: number;
  questionCount: number;
  listeningScriptCount: number;
  parseNotes: string;
  parsed: PastExamParseDraft;
}

export interface PastExamCommitResponse {
  universitySlug: string;
  year: number;
  questionIds: string[];
  examPdfStoragePaths: string[];
  answersPdfStoragePath: string | null;
  listeningPdfStoragePath: string | null;
  profileStatus: string;
}

export interface ExamYearSummary {
  id: string;
  year: number;
  examType?: string;
  importStatus?: string;
  questionCount?: number;
  listeningScriptCount?: number;
  listeningScripts?: Array<{ title?: string; content: string; notes?: string }>;
  parseNotes?: string;
}

export interface PastQuestionSummary {
  id: string;
  year: number;
  majorOrder: number;
  partLabel?: string;
  type?: string;
  answerFormat?: string;
  prompt: string;
  modelAnswer?: string;
  profileStatus?: string;
}

export interface ExamYearDetailResponse {
  examYear: ExamYearSummary | null;
  questions: PastQuestionSummary[];
}

export interface TeacherExamMaterialResponse {
  id: string;
  title: string;
  content: string;
  attachments: Array<{ name: string; storagePath: string; contentType: string }>;
}
