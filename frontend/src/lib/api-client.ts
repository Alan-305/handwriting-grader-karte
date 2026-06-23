import type {
  BeginKarteAnalysisResponse,
  AnalyzeStudentResponse,
  ExamYearDetailResponse,
  ExamYearSummary,
  GradeSessionResponse,
  KarteAnalysisStepResponse,
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
  GenerationUnit,
  QuestionTypeCatalogItem,
  TestDraftSet,
  ValidityReport,
} from "@/types/question-design";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_BASE.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!base) return normalizedPath;
  return `${base}${normalizedPath}`;
}

function apiConnectionErrorMessage(): string {
  return (
    "API に接続できませんでした。" +
    " 管理者は Hosting の /api 転送設定、または VITE_API_BASE の設定を確認してください。"
  );
}

function parseJsonSafely<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const trimmed = text.trimStart();
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
      throw new Error(apiConnectionErrorMessage());
    }
    throw new Error("サーバーから不正な応答が返されました。");
  }
}

function formatApiErrorMessage(
  err: unknown,
  status: number,
  statusText: string,
): string {
  if (typeof err === "object" && err !== null && "error" in err) {
    const body = err as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
    if (Array.isArray(body.error)) {
      return body.error
        .map((e: { msg?: string }) => e.msg ?? JSON.stringify(e))
        .join("; ");
    }
  }
  if (status === 502 || status === 504) {
    return (
      "サーバーとの通信が途切れたか、処理がタイムアウトしました。" +
      " しばらく待ってから再試行してください。"
    );
  }
  if (statusText && statusText !== "OK") {
    return `${statusText} (${status})`;
  }
  return `API error (${status})`;
}

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

  let res: Response;
  try {
    res = await fetch(resolveApiUrl(path), { ...init, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/aborted|timeout|network|failed to fetch|load failed/i.test(msg)) {
      throw new Error(
        "サーバーに接続できませんでした。バックエンドが起動しているか、ネットワークを確認してください。",
      );
    }
    if (/did not match the expected pattern/i.test(msg)) {
      throw new Error(apiConnectionErrorMessage());
    }
    throw new Error(msg || "通信エラーが発生しました");
  }

  const responseText = await res.text();
  const contentType = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    const err =
      contentType.includes("application/json") && responseText
        ? parseJsonSafely<unknown>(responseText)
        : {};
    throw new Error(formatApiErrorMessage(err, res.status, res.statusText));
  }

  if (!responseText) {
    return {} as T;
  }

  return parseJsonSafely<T>(responseText);
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

  beginTranscription: (
    token: string,
    sessionId: string,
    options?: { resume?: boolean },
  ) =>
    request<{ sessionId: string; total: number; resumeFrom?: number }>(
      `/api/sessions/${sessionId}/transcribe/begin`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: options?.resume ?? false }),
        token,
      },
    ),

  transcribeStep: (token: string, sessionId: string, stepIndex: number) =>
    request<import("@/types/api").TranscribeStepResponse>(
      `/api/sessions/${sessionId}/transcribe/step`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepIndex }),
        token,
      },
    ),

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

  beginGrading: (token: string, sessionId: string) =>
    request<{ sessionId: string; total: number }>(
      `/api/sessions/${sessionId}/grade/begin`,
      { method: "POST", token },
    ),

  gradeStep: (token: string, sessionId: string, stepIndex: number) =>
    request<import("@/types/api").GradeStepResponse>(
      `/api/sessions/${sessionId}/grade/step`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepIndex }),
        token,
      },
    ),

  gradeSession: (
    token: string,
    sessionId: string,
    options?: { preserveTeacherEdits?: boolean },
  ) =>
    request<GradeSessionResponse>(`/api/sessions/${sessionId}/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preserveTeacherEdits: options?.preserveTeacherEdits ?? false,
      }),
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

  beginKarteAnalysis: (token: string, studentId: string) =>
    request<BeginKarteAnalysisResponse>(`/api/students/${studentId}/analyze/begin`, {
      method: "POST",
      token,
    }),

  karteAnalysisStep: (token: string, studentId: string, stepIndex: number) =>
    request<KarteAnalysisStepResponse>(`/api/students/${studentId}/analyze/step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepIndex }),
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

  listGenerationUnits: (token: string, slug: string) =>
    request<{ generationUnits: GenerationUnit[] }>(
      `/api/universities/${slug}/generation-units`,
      { token },
    ),

  generateQ5: (
    token: string,
    slug: string,
    body: {
      referenceYears?: number[];
      difficulty?: string;
      topicHint?: string;
      studentId?: string;
    },
  ) =>
    request<{ draft: GeneratedQuestionDraft }>(`/api/universities/${slug}/generate-q5`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

  generateQ4B: (
    token: string,
    slug: string,
    body: {
      referenceYears?: number[];
      difficulty?: string;
      topicHint?: string;
      studentId?: string;
    },
  ) =>
    request<{ draft: GeneratedQuestionDraft }>(`/api/universities/${slug}/generate-q4b`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

  generateQ4A: (
    token: string,
    slug: string,
    body: {
      referenceYears?: number[];
      difficulty?: string;
      topicHint?: string;
      sourcePassage?: string;
      studentId?: string;
    },
  ) =>
    request<{ draft: GeneratedQuestionDraft }>(`/api/universities/${slug}/generate-q4a`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

  generateQ2: (
    token: string,
    slug: string,
    body: {
      referenceYears?: number[];
      difficulty?: string;
      topicHint?: string;
      sourcePassage?: string;
      studentId?: string;
    },
  ) =>
    request<{ draft: GeneratedQuestionDraft }>(`/api/universities/${slug}/generate-q2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

  generateQ1: (
    token: string,
    slug: string,
    body: {
      referenceYears?: number[];
      difficulty?: string;
      topicHint?: string;
      sourcePassage?: string;
      studentId?: string;
    },
  ) =>
    request<{ draft: GeneratedQuestionDraft }>(`/api/universities/${slug}/generate-q1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

  generateQ1A: (
    token: string,
    slug: string,
    body: {
      referenceYears?: number[];
      difficulty?: string;
      topicHint?: string;
      sourcePassage?: string;
      studentId?: string;
    },
  ) =>
    request<{ draft: GeneratedQuestionDraft }>(`/api/universities/${slug}/generate-q1a`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

  generateQ1B: (
    token: string,
    slug: string,
    body: {
      referenceYears?: number[];
      difficulty?: string;
      topicHint?: string;
      sourcePassage?: string;
      studentId?: string;
    },
  ) =>
    request<{ draft: GeneratedQuestionDraft }>(`/api/universities/${slug}/generate-q1b`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

  generateQ2A: (
    token: string,
    slug: string,
    body: {
      referenceYears?: number[];
      difficulty?: string;
      topicHint?: string;
      studentId?: string;
    },
  ) =>
    request<{ draft: GeneratedQuestionDraft }>(`/api/universities/${slug}/generate-q2a`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

  generateQ2B: (
    token: string,
    slug: string,
    body: {
      referenceYears?: number[];
      difficulty?: string;
      topicHint?: string;
      studentId?: string;
    },
  ) =>
    request<{ draft: GeneratedQuestionDraft }>(`/api/universities/${slug}/generate-q2b`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      token,
    }),

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

  generatePassageTranslations: (
    token: string,
    testId: string,
    body?: { questionIds?: string[]; force?: boolean },
  ) =>
    request<{
      translations: Record<string, string>;
      skippedQuestionIds: string[];
      errors: Record<string, string>;
    }>(`/api/tests/${testId}/generate-passage-translations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      token,
    }),

  generateDraftPassageTranslation: (
    token: string,
    draftId: string,
    body?: { force?: boolean },
  ) =>
    request<{
      translation: string;
      draft: GeneratedQuestionDraft;
      generated: boolean;
    }>(`/api/question-drafts/${draftId}/generate-passage-translation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
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
      studentId?: string;
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
