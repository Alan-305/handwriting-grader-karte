import { apiClient } from "@/lib/api-client";
import type { AnalyzeStudentResponse } from "@/types/api";

const STAGE_PROGRESS_LABELS = [
  "弱点を分析中",
  "志望校とのギャップを分析中",
  "指導プランを作成中",
  "内容を確認して保存中",
] as const;

/** 段階ごとに API を分け、Hosting 60秒制限を避けながらカルテ AI 分析を実行する */
export async function runKarteAnalysisSteps(
  token: string,
  studentId: string,
  onProgress?: (current: number, total: number, message: string) => void,
): Promise<AnalyzeStudentResponse> {
  const { total } = await apiClient.beginKarteAnalysis(token, studentId);
  let snapshot: AnalyzeStudentResponse | undefined;

  for (let stepIndex = 0; stepIndex < total; stepIndex += 1) {
    const label = STAGE_PROGRESS_LABELS[stepIndex] ?? "分析中";
    onProgress?.(stepIndex, total, `${label}（${stepIndex + 1}/${total}）`);
    const payload = await apiClient.karteAnalysisStep(token, studentId, stepIndex);
    if (payload.done && payload.snapshot) {
      snapshot = payload.snapshot;
    }
  }

  if (!snapshot) {
    throw new Error("カルテ分析の結果を取得できませんでした。もう一度お試しください。");
  }

  return snapshot;
}
