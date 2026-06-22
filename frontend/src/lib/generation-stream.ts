import type { GeneratedQuestionDraft } from "@/types/question-design";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_BASE.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!base) return normalizedPath;
  return `${base}${normalizedPath}`;
}

export type GenerationStreamProgressEvent = {
  type: "progress";
  stage: string;
  status: string;
  message: string;
  attempt?: number;
  maxAttempts?: number;
  issues?: string[];
  provider?: string;
};

type GenerationStreamCompleteEvent = {
  type: "complete";
  draft: GeneratedQuestionDraft;
};

type GenerationStreamErrorEvent = {
  type: "error";
  error: string;
};

type GenerationStreamEvent =
  | GenerationStreamProgressEvent
  | GenerationStreamCompleteEvent
  | GenerationStreamErrorEvent;

export type GenerationStreamBody = {
  referenceYears?: number[];
  difficulty?: string;
  topicHint?: string;
  studentId?: string;
  sourcePassage?: string;
};

export async function generateDraftWithProgress(
  token: string,
  streamPath: string,
  body: GenerationStreamBody,
  onProgress: (event: GenerationStreamProgressEvent) => void,
  errorFallbackLabel = "問題の生成",
): Promise<GeneratedQuestionDraft> {
  const url = resolveApiUrl(streamPath);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `${errorFallbackLabel}に失敗しました（${res.status}）`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      if (text.trim()) message = text.trim();
    }
    throw new Error(message);
  }

  if (!res.body) {
    throw new Error("サーバーから進捗を受信できませんでした。");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let draft: GeneratedQuestionDraft | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as GenerationStreamEvent;
      if (event.type === "progress") {
        onProgress(event);
        continue;
      }
      if (event.type === "complete") {
        draft = event.draft;
        continue;
      }
      if (event.type === "error") {
        throw new Error(event.error || `${errorFallbackLabel}に失敗しました`);
      }
    }
  }

  if (!draft) {
    throw new Error("生成は完了しましたが、下書きデータを受信できませんでした。");
  }
  return draft;
}

/** @deprecated use generateDraftWithProgress */
export async function generateQ5WithProgress(
  token: string,
  slug: string,
  body: GenerationStreamBody,
  onProgress: (event: GenerationStreamProgressEvent) => void,
): Promise<GeneratedQuestionDraft> {
  return generateDraftWithProgress(
    token,
    `/api/universities/${slug}/generate-q5-stream`,
    body,
    onProgress,
    "第5問の生成",
  );
}

export async function generateQ2BWithProgress(
  token: string,
  slug: string,
  body: GenerationStreamBody,
  onProgress: (event: GenerationStreamProgressEvent) => void,
): Promise<GeneratedQuestionDraft> {
  return generateDraftWithProgress(
    token,
    `/api/universities/${slug}/generate-q2b-stream`,
    body,
    onProgress,
    "第2問(B)の生成",
  );
}
