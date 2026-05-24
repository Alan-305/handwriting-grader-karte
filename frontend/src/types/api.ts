export interface UploadSessionResponse {
  sessionId: string;
  sourceImagePath: string;
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
