import type {
  AnalyzeStudentResponse,
  ExamYearDetailResponse,
  ExamYearSummary,
  GradeSessionResponse,
  PatchTranscriptionsRequest,
  PastExamCommitResponse,
  CropPreviewResponse,
  CropTargetsResponse,
  SaveManualCropRequest,
  SaveManualCropResponse,
  TranscribeSessionResponse,
  PastExamImportResponse,
  SessionProgressResponse,
  TeacherExamMaterialResponse,
  UploadSessionResponse,
} from "@/types/api";
import type {
  BuildTestDraftBody,
  GenerateQuestionsResponse,
  GeneratedQuestionDraft,
  QuestionTypeCatalogItem,
  TestDraftSet,
  ValidityReport,
} from "@/types/question-design";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers: HeadersInit = {
    ...(init.headers ?? {}),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "API error");
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  uploadSession: (token: string, formData: FormData) =>
    request<UploadSessionResponse>("/api/sessions/upload", {
      method: "POST",
      body: formData,
      token,
    }),

  alignSession: (token: string, sessionId: string) =>
    request<{ alignedImagePath: string; alignedImagePaths?: string[] }>(
      `/api/sessions/${sessionId}/align`,
      {
        method: "POST",
        token,
      },
    ),

  cropSession: (token: string, sessionId: string) =>
    request<{ crops: Array<{ questionId: string; order: number; path: string }> }>(
      `/api/sessions/${sessionId}/crop`,
      { method: "POST", token },
    ),

  getCropPreview: (token: string, sessionId: string) =>
    request<CropPreviewResponse>(`/api/sessions/${sessionId}/crop-preview`, { token }),

  getCropTargets: (token: string, sessionId: string) =>
    request<CropTargetsResponse>(`/api/sessions/${sessionId}/crop-targets`, { token }),

  saveManualCrop: (token: string, sessionId: string, body: SaveManualCropRequest) =>
    request<SaveManualCropResponse>(`/api/sessions/${sessionId}/manual-crops`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

  transcribeSession: (token: string, sessionId: string) =>
    request<TranscribeSessionResponse>(`/api/sessions/${sessionId}/transcribe`, {
      method: "POST",
      token,
    }),

  patchTranscriptions: (
    token: string,
    sessionId: string,
    body: PatchTranscriptionsRequest,
  ) =>
    request<{ sessionId: string; results: Array<Record<string, unknown>> }>(
      `/api/sessions/${sessionId}/transcriptions`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        token,
      },
    ),

  gradeSession: (token: string, sessionId: string) =>
    request<GradeSessionResponse>(`/api/sessions/${sessionId}/grade`, {
      method: "POST",
      token,
    }),

  confirmGrading: (token: string, sessionId: string) =>
    request<{ status: string; sessionId: string }>(
      `/api/sessions/${sessionId}/confirm-grading`,
      { method: "POST", token },
    ),

  getSessionProgress: (token: string, sessionId: string) =>
    request<SessionProgressResponse>(`/api/sessions/${sessionId}/progress`, { token }),

  completeSession: (token: string, sessionId: string) =>
    request<{ status: string }>(`/api/sessions/${sessionId}/complete`, {
      method: "POST",
      token,
    }),

  analyzeStudent: (token: string, studentId: string) =>
    request<AnalyzeStudentResponse>(`/api/students/${studentId}/analyze`, {
      method: "POST",
      token,
    }),

  refreshStats: (token: string, studentId: string) =>
    request<{ status: string }>(`/api/students/${studentId}/stats/refresh`, {
      method: "POST",
      token,
    }),

  listPastExamUniversities: (token: string) =>
    request<{ universities: Array<{ id: string; slug: string; name: string; nameEn?: string }> }>(
      "/api/universities",
      { token },
    ),

  registerPastExamUniversity: (
    token: string,
    body: { slug: string; name: string; nameEn?: string },
  ) =>
    request<{ university: { id: string; slug: string; name: string; nameEn?: string } }>(
      "/api/universities",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        token,
      },
    ),

  importPastExam: (token: string, slug: string, formData: FormData) =>
    request<PastExamImportResponse>(`/api/universities/${slug}/past-exams/import`, {
      method: "POST",
      body: formData,
      token,
    }),

  listExamYears: (token: string, slug: string) =>
    request<{ examYears: ExamYearSummary[] }>(`/api/universities/${slug}/exam-years`, {
      token,
    }),

  getExamYearDetail: (token: string, slug: string, year: number) =>
    request<ExamYearDetailResponse>(`/api/universities/${slug}/exam-years/${year}`, {
      token,
    }),

  getTeacherExamMaterial: (token: string, slug: string, year: number) =>
    request<{ material: TeacherExamMaterialResponse | null }>(
      `/api/universities/${slug}/exam-years/${year}/teacher-materials`,
      { token },
    ),

  saveTeacherExamMaterial: (
    token: string,
    slug: string,
    year: number,
    body: { title: string; content: string; attachments: TeacherExamMaterialResponse["attachments"] },
  ) =>
    request<{ material: TeacherExamMaterialResponse }>(
      `/api/universities/${slug}/exam-years/${year}/teacher-materials`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        token,
      },
    ),

  commitPastExamImport: (
    token: string,
    slug: string,
    sessionId: string,
    body: { profileStatus?: "draft" | "approved"; parsed?: PastExamImportResponse["parsed"] },
  ) =>
    request<PastExamCommitResponse>(
      `/api/universities/${slug}/past-exams/import/${sessionId}/commit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        token,
      },
    ),

  listQuestionTypes: (token: string, slug: string) =>
    request<{ questionTypes: QuestionTypeCatalogItem[] }>(
      `/api/universities/${slug}/question-types`,
      { token },
    ),

  runValidityCheck: (
    token: string,
    testId: string,
    body: {
      universitySlug?: string;
      referenceYears?: number[];
      questions?: Array<{ order: number; type: string; prompt: string; modelAnswer: string; points: number }>;
    },
  ) =>
    request<{ report: ValidityReport }>(`/api/tests/${testId}/validity-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

  generateQuestions: (
    token: string,
    slug: string,
    body: {
      selections: Array<{ majorOrder: number; partLabel?: string | null; typeLabel?: string }>;
      referenceYears?: number[];
      difficulty?: string;
      topicHint?: string;
      countPerType?: number;
    },
  ) =>
    request<GenerateQuestionsResponse>(`/api/universities/${slug}/generate-questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

  listQuestionDrafts: (token: string) =>
    request<{ drafts: GeneratedQuestionDraft[] }>("/api/question-drafts", { token }),

  deleteQuestionDraft: (token: string, draftId: string) =>
    request<{ status: string }>(`/api/question-drafts/${draftId}`, {
      method: "DELETE",
      token,
    }),

  promoteQuestionDraft: (token: string, draftId: string, testId: string) =>
    request<{ testId: string; questionId: string; order: number; testTitle: string }>(
      `/api/question-drafts/${draftId}/promote`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId }),
        token,
      },
    ),

  promoteQuestionDraftAsNewTest: (token: string, draftId: string, title?: string) =>
    request<{ testId: string; questionId: string; order: number; testTitle: string }>(
      `/api/question-drafts/${draftId}/promote-new`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(title ? { title } : {}),
        token,
      },
    ),

  buildTestDraft: (token: string, slug: string, body: BuildTestDraftBody) =>
    request<{ draft: TestDraftSet }>(`/api/universities/${slug}/build-test-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

  listTestDrafts: (token: string) =>
    request<{ drafts: TestDraftSet[] }>("/api/test-drafts", { token }),

  getTestDraft: (token: string, draftId: string) =>
    request<{ draft: TestDraftSet }>(`/api/test-drafts/${draftId}`, { token }),

  deleteTestDraft: (token: string, draftId: string) =>
    request<{ status: string }>(`/api/test-drafts/${draftId}`, {
      method: "DELETE",
      token,
    }),

  promoteTestDraftAsNewTest: (token: string, draftId: string, title?: string) =>
    request<{ testId: string; questionCount: number; testTitle: string }>(
      `/api/test-drafts/${draftId}/promote-new`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(title ? { title } : {}),
        token,
      },
    ),

  getPastExamAdvice: (token: string, sessionId: string) =>
    request<{ advice: import("@/types/past-exam-advice").SessionPastExamAdvice | null }>(
      `/api/sessions/${sessionId}/past-exam-advice`,
      { token },
    ),

  generatePastExamAdvice: (token: string, sessionId: string, universitySlug?: string) =>
    request<{ advice: import("@/types/past-exam-advice").SessionPastExamAdvice }>(
      `/api/sessions/${sessionId}/past-exam-advice`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(universitySlug ? { universitySlug } : {}),
        token,
      },
    ),
};
