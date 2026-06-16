import { apiClient } from "@/lib/api-client";

/** 設問ごとに API を分け、タイムアウトを防ぎながら読み取りを実行する */
export async function runTranscriptionSteps(
  token: string,
  sessionId: string,
  onProgress?: (current: number, total: number, message: string) => void,
  options?: { resume?: boolean },
): Promise<void> {
  const { total, resumeFrom = 0 } = await apiClient.beginTranscription(token, sessionId, {
    resume: options?.resume ?? false,
  });
  if (resumeFrom >= total) {
    onProgress?.(total, total, "読み取り済み");
    return;
  }
  for (let stepIndex = resumeFrom; stepIndex < total; stepIndex += 1) {
    const label = `読み取り中（${stepIndex + 1}/${total}）`;
    onProgress?.(stepIndex, total, label);
    await apiClient.transcribeStep(token, sessionId, stepIndex);
  }
}

/** 設問ごとに API を分け、タイムアウトを防ぎながら添削を実行する */
export async function runGradingSteps(
  token: string,
  sessionId: string,
  onProgress?: (current: number, total: number, message: string) => void,
): Promise<void> {
  const { total } = await apiClient.beginGrading(token, sessionId);
  for (let stepIndex = 0; stepIndex < total; stepIndex += 1) {
    const payload = await apiClient.gradeStep(token, sessionId, stepIndex);
    const label =
      payload.result?.partLabel != null
        ? `第${payload.result.order}問 ${payload.result.partLabel} を添削中（${stepIndex + 1}/${total}）`
        : `第${payload.result?.order ?? stepIndex + 1}問を添削中（${stepIndex + 1}/${total}）`;
    onProgress?.(stepIndex, total, label);
  }
}
