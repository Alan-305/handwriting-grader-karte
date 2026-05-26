import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingOverlay({
  message = "添削中",
  visible,
}: {
  message?: "添削中" | "考えてます" | "取り込み中" | string;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-xl bg-white px-10 py-8 shadow-xl">
        <Loader2 className="h-10 w-10 animate-spin text-blue-800" />
        <p className="font-ja text-lg font-medium text-slate-800">{message}</p>
        <p className="font-ja text-sm text-slate-500">しばらくお待ちください</p>
      </div>
    </div>
  );
}

export function InlineLoading({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 font-ja text-sm text-slate-600", className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      {message}
    </div>
  );
}
