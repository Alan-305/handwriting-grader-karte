import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_OPTIONS,
  FORMAT_LABEL,
  resolveFormatOptions,
} from "@/lib/answer-format";
import { NO_MODEL_ANSWER_HINT, resolveGradingMode } from "@/lib/grading-mode";
import type { AnswerFormatOptions, AnswerPart, AnswerSheetFormat, Question } from "@/types/firestore";

const ANSWER_FORMATS: AnswerSheetFormat[] = [
  "japanese_grid",
  "underline",
  "english_composition",
  "short",
];

export function AnswerPartFormatFields({
  answerFormat,
  formatOptions,
  onChangeFormat,
  onChangeOptions,
}: {
  answerFormat: AnswerSheetFormat;
  formatOptions?: AnswerFormatOptions;
  onChangeFormat: (format: AnswerSheetFormat) => void;
  onChangeOptions: (options: AnswerFormatOptions) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="font-ja text-sm">解答用紙形式</label>
        <select
          className="flex h-11 w-full rounded-lg border px-3 font-ja text-sm"
          value={answerFormat}
          onChange={(e) => onChangeFormat(e.target.value as AnswerSheetFormat)}
        >
          {ANSWER_FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </select>
      </div>

      {answerFormat === "japanese_grid" && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="font-ja text-sm">マス目の行数</label>
            <Input
              type="number"
              min={1}
              max={20}
              value={formatOptions?.gridRows ?? DEFAULT_OPTIONS.japanese_grid.gridRows}
              onChange={(e) =>
                onChangeOptions({ ...formatOptions, gridRows: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <label className="font-ja text-sm">字数指定（任意）</label>
            <Input
              type="number"
              min={20}
              step={20}
              value={formatOptions?.charLimit ?? ""}
              placeholder="例: 100"
              onChange={(e) => {
                const charLimit = e.target.value ? Number(e.target.value) : undefined;
                const next = { ...formatOptions, charLimit };
                if (charLimit && charLimit > 0) {
                  next.gridRows = Math.ceil(charLimit / 20);
                }
                onChangeOptions(next);
              }}
            />
          </div>
        </div>
      )}

      {answerFormat === "underline" && (
        <div className="max-w-xs">
          <label className="font-ja text-sm">下線の本数</label>
          <Input
            type="number"
            min={1}
            max={15}
            value={formatOptions?.underlineLines ?? DEFAULT_OPTIONS.underline.underlineLines}
            onChange={(e) =>
              onChangeOptions({ ...formatOptions, underlineLines: Number(e.target.value) })
            }
          />
        </div>
      )}

      {answerFormat === "english_composition" && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="font-ja text-sm">目標語数</label>
            <Input
              type="number"
              min={20}
              step={10}
              value={formatOptions?.targetWords ?? DEFAULT_OPTIONS.english_composition.targetWords}
              onChange={(e) => {
                const targetWords = Number(e.target.value);
                onChangeOptions({
                  ...formatOptions,
                  targetWords,
                  compositionLines: Math.max(4, Math.ceil(targetWords / 8)),
                });
              }}
            />
          </div>
          <div>
            <label className="font-ja text-sm">下線の本数</label>
            <Input
              type="number"
              min={4}
              max={20}
              value={
                formatOptions?.compositionLines ??
                resolveFormatOptions("english_composition", formatOptions).compositionLines
              }
              onChange={(e) =>
                onChangeOptions({ ...formatOptions, compositionLines: Number(e.target.value) })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function AnswerPartCard({
  part,
  question,
  canRemove,
  onChange,
  onRemove,
}: {
  part: AnswerPart;
  question: Pick<Question, "modelAnswer" | "gradingMode">;
  canRemove: boolean;
  onChange: (patch: Partial<AnswerPart>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-ja text-sm font-semibold text-slate-800">小問 {part.label}</p>
        {canRemove && (
          <button
            type="button"
            className="font-ja text-xs text-red-600 hover:text-red-700"
            onClick={onRemove}
          >
            削除
          </button>
        )}
      </div>
      <AnswerPartFormatFields
        answerFormat={part.answerFormat}
        formatOptions={part.formatOptions}
        onChangeFormat={(answerFormat) =>
          onChange({
            answerFormat,
            formatOptions: { ...DEFAULT_OPTIONS[answerFormat] },
          })
        }
        onChangeOptions={(formatOptions) => onChange({ formatOptions })}
      />
      <div className="mt-3">
        <label className="font-ja text-sm">模範解答（{part.label}）</label>
        <Textarea
          value={part.modelAnswer ?? ""}
          onChange={(e) => onChange({ modelAnswer: e.target.value })}
          className="font-en mt-1"
          rows={2}
          placeholder="空欄のままでも可（自由英作文など）"
        />
        {resolveGradingMode(question, part) === "no_model" && (
          <p className="mt-1 font-ja text-xs text-blue-700">{NO_MODEL_ANSWER_HINT}</p>
        )}
      </div>
    </div>
  );
}
