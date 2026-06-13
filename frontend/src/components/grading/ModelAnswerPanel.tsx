export function ModelAnswerPanel({ modelAnswer }: { modelAnswer: string }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="space-y-1">
        <p className="font-ja text-sm font-semibold text-slate-600">模範解答</p>
        <p className="text-model-answer font-en text-slate-900">{modelAnswer}</p>
      </div>
    </div>
  );
}
