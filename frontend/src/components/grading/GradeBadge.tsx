import { cn } from "@/lib/utils";
import type { GradeLevel } from "@/types/firestore";

const styles: Record<GradeLevel, string> = {
  優: "bg-green-100 text-green-800 border-green-200",
  良: "bg-amber-100 text-amber-800 border-amber-200",
  不可: "bg-orange-100 text-orange-800 border-orange-200",
};

export function GradeBadge({ grade, className }: { grade: GradeLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-4 text-lg font-semibold font-ja",
        styles[grade],
        className,
      )}
    >
      {grade}
    </span>
  );
}
