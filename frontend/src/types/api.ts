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

export interface TranscribeSessionResponse {
  sessionId: string;
  results: Array<Record<string, unknown>>;
}

export interface TranscribeStepResponse {
  sessionId: string;
  stepIndex: number;
  total: number;
  done: boolean;
  result: Record<string, unknown>;
}

export interface GradeStepResponse {
  sessionId: string;
  stepIndex: number;
  total: number;
  done: boolean;
  result: {
    order?: number;
    partLabel?: string;
  };
  totalScore?: number;
  maxScore?: number;
  totalScore100?: number;
}

export interface CropPreviewTarget {
  questionId: string;
  order: number;
  partIndex: number;
  partLabel?: string;
  cropRegion: {
    x: number;
    y: number;
    width: number;
    height: number;
    pageIndex?: number;
  };
  touchesHeader?: boolean;
}

export interface CropPreviewResponse {
  sessionId: string;
  alignedImagePaths: string[];
  pageWidth: number;
  pageHeight: number;
  headerExclusion: CropPreviewTarget["cropRegion"];
  targets: CropPreviewTarget[];
}

export interface CropTargetsResponse {
  sessionId: string;
  alignedImagePaths: string[];
  pageWidth: number;
  pageHeight: number;
  targets: Array<{
    questionId: string;
    order: number;
    partIndex: number;
    partLabel?: string;
    suggestedRegion?: CropPreviewTarget["cropRegion"];
    savedRegion?: CropPreviewTarget["cropRegion"];
    croppedImagePath?: string;
  }>;
  allAssigned: boolean;
}

export interface SaveManualCropRequest {
  order: number;
  partIndex: number;
  cropRegion: CropPreviewTarget["cropRegion"];
}

export interface SaveManualCropResponse {
  sessionId: string;
  croppedImagePath: string;
  cropRegion: CropPreviewTarget["cropRegion"];
  allAssigned: boolean;
}

export interface PatchTranscriptionsRequest {
  items: Array<{
    id: string;
    studentAnswerText?: string;
    transcriptionStatus?: "pending_review" | "confirmed";
  }>;
  confirmAll?: boolean;
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
  uploadedSlots?: Array<"exam" | "answers" | "listening" | "analysis">;
  parsed: PastExamParseDraft;
}

export interface PastExamCommitResponse {
  universitySlug: string;
  year: number;
  questionIds: string[];
  examPdfStoragePaths: string[];
  answersPdfStoragePath: string | null;
  listeningPdfStoragePath: string | null;
  analysisPdfStoragePath?: string | null;
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
  sourceAnalysisPdfPath?: string;
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
