import { cn } from "@/lib/utils";
import type { AdviceCard } from "@/types/firestore";

const priorityStyles = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-blue-500",
};

const categoryLabels: Record<AdviceCard["category"], string> = {
  grammar: "文法",
  vocabulary: "語彙",
  structure: "文構造",
  exam_strategy: "受験戦略",
};

export function AdviceCardItem({ card }: { card: AdviceCard }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm",
        priorityStyles[card.priority],
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="font-ja text-base font-semibold text-slate-900">{card.title}</h4>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-ja text-slate-600">
          {categoryLabels[card.category]}
        </span>
      </div>
      <p className="font-ja text-sm leading-relaxed text-slate-700">{card.body}</p>
    </div>
  );
}
