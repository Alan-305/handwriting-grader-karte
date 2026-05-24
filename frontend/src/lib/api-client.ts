import type {
  AnalyzeStudentResponse,
  GradeSessionResponse,
  SessionProgressResponse,
  UploadSessionResponse,
} from "@/types/api";

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
    request<{ alignedImagePath: string }>(`/api/sessions/${sessionId}/align`, {
      method: "POST",
      token,
    }),

  cropSession: (token: string, sessionId: string) =>
    request<{ crops: Array<{ questionId: string; order: number; path: string }> }>(
      `/api/sessions/${sessionId}/crop`,
      { method: "POST", token },
    ),

  gradeSession: (token: string, sessionId: string) =>
    request<GradeSessionResponse>(`/api/sessions/${sessionId}/grade`, {
      method: "POST",
      token,
    }),

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
};
