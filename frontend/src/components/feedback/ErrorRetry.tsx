import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorRetry({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-red-200 bg-red-50 p-8 text-center">
      <AlertCircle className="h-10 w-10 text-red-600" />
      <p className="font-ja text-sm text-red-800">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          再試行
        </Button>
      )}
    </div>
  );
}
