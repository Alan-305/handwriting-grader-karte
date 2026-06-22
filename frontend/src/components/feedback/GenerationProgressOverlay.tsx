import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type GenerationProgressState = {
  message: string;
  stage?: string;
  status?: string;
  attempt?: number;
  maxAttempts?: number;
  issues?: string[];
  provider?: string;
  log: string[];
};

const STAGE_LABELS: Record<string, string> = {
  pipeline: "準備",
  problem: "問題文",
  passage: "英文本文",
  questions: "設問",
  solver: "妥当性検証",
  teacher_pack: "解答・解説",
  validation: "検証",
  save: "下書き保存",
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude",
  gemini: "Gemini",
  mock: "開発",
};

export function GenerationProgressOverlay({
  visible,
  progress,
}: {
  visible: boolean;
  progress: GenerationProgressState;
}) {
  if (!visible) return null;

  const stageLabel = progress.stage ? STAGE_LABELS[progress.stage] ?? progress.stage : null;
  const providerLabel = progress.provider
    ? PROVIDER_LABELS[progress.provider] ?? progress.provider
    : null;
  const isRetry = progress.status === "retry";
  const showAttempt =
    progress.attempt != null &&
    progress.maxAttempts != null &&
    progress.maxAttempts > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        className="flex w-full max-w-lg flex-col gap-4 rounded-xl bg-white px-6 py-7 shadow-xl"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex items-start gap-4">
          <Loader2 className="mt-0.5 h-9 w-9 shrink-0 animate-spin text-blue-800" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-ja text-lg font-medium leading-snug text-slate-800">
              {progress.message || "考えてます"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {stageLabel && (
                <span className="rounded-full bg-blue-50 px-3 py-1 font-ja text-xs font-medium text-blue-900">
                  {stageLabel}
                </span>
              )}
              {showAttempt && (
                <span className="font-ja text-xs text-slate-500">
                  {progress.attempt}/{progress.maxAttempts}回目
                </span>
              )}
              {providerLabel && (
                <span className="rounded-full bg-slate-100 px-3 py-1 font-ja text-xs text-slate-600">
                  {providerLabel}
                </span>
              )}
            </div>
            <p className="font-ja text-sm text-slate-500">
              処理は継続中です。この画面を閉じずにお待ちください（1〜3分かかることがあります）。
            </p>
          </div>
        </div>

        {isRetry && (progress.issues?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="font-ja text-sm font-medium text-amber-950">
              検証で課題を検出 — ベテラン講師が作り直しています
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 font-ja text-xs leading-relaxed text-amber-900">
              {progress.issues!.slice(0, 4).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
              {(progress.issues?.length ?? 0) > 4 && (
                <li>ほか {(progress.issues?.length ?? 0) - 4} 件</li>
              )}
            </ul>
          </div>
        )}

        {progress.log.length > 1 && (
          <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <p className="font-ja text-xs font-medium text-slate-500">作業ログ</p>
            <ul className="mt-1 space-y-1">
              {progress.log.slice(-5).map((line, i) => (
                <li
                  key={`${i}-${line}`}
                  className={cn(
                    "font-ja text-xs leading-relaxed",
                    i === progress.log.length - 1 ? "text-slate-700" : "text-slate-400",
                  )}
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
