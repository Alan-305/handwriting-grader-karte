import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  modelAnswerForPrint,
  studentAnswerForPrint,
} from "@/lib/question-results";
import type { GradeLevel, QuestionResult } from "@/types/firestore";

const GRADES: GradeLevel[] = ["優", "良", "不可"];

function resultLabel(r: QuestionResult): string {
  return r.partLabel ? `第${r.order}問 ${r.partLabel}` : `第${r.order}問`;
}

export function GradingPrintQuestionEditor({
  result,
  allResults,
  kind,
  included,
  onIncludedChange,
  onChange,
}: {
  result: QuestionResult;
  allResults: QuestionResult[];
  kind: "student" | "teacher";
  included: boolean;
  onIncludedChange: (included: boolean) => void;
  onChange: (patch: Partial<QuestionResult>) => void;
}) {
  const studentText = studentAnswerForPrint(result, allResults);
  const modelText = modelAnswerForPrint(result, allResults);
  const isComposition = Boolean(
    result.contentEvaluation || result.grammarEvaluation || result.polishedAnswer,
  );

  return (
    <Card className={`space-y-3 p-4 ${!included ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-ja font-semibold">{resultLabel(result)}</h3>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 font-ja text-sm">
          <input
            type="checkbox"
            checked={included}
            onChange={(e) => onIncludedChange(e.target.checked)}
          />
          この大問を印刷に含める
        </label>
      </div>

      {kind === "student" && (
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="font-ja text-sm">評価</label>
            <select
              className="mt-1 flex h-11 w-full rounded-lg border px-3 font-ja text-sm"
              value={result.grade}
              onChange={(e) => onChange({ grade: e.target.value as GradeLevel })}
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-ja text-sm">得点</label>
            <Input
              type="number"
              min={0}
              max={result.maxPoints}
              value={result.score}
              onChange={(e) => onChange({ score: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-end font-ja text-sm text-slate-500">/ {result.maxPoints}点</div>
        </div>
      )}

      <div>
        <label className="font-ja text-sm">
          {kind === "student" ? "あなたの解答（書き起こし）" : "生徒の解答（書き起こし）"}
        </label>
        <Textarea
          className="font-en mt-1"
          rows={2}
          value={studentText}
          onChange={(e) => onChange({ studentAnswerText: e.target.value })}
        />
      </div>

      <div>
        <label className="font-ja text-sm">講評</label>
        <Textarea
          className="mt-1 font-ja"
          rows={2}
          value={result.feedback ?? ""}
          onChange={(e) => onChange({ feedback: e.target.value })}
        />
      </div>

      {kind === "teacher" && (
        <>
          <div>
            <label className="font-ja text-sm">指導ポイント</label>
            <Textarea
              className="mt-1 font-ja"
              rows={3}
              value={result.teacherNotes ?? ""}
              onChange={(e) => onChange({ teacherNotes: e.target.value })}
            />
          </div>
          <div>
            <label className="font-ja text-sm">傾向タグ（カンマ区切り）</label>
            <Input
              className="mt-1 font-ja"
              value={(result.errorTags ?? []).join("、")}
              onChange={(e) =>
                onChange({
                  errorTags: e.target.value
                    .split(/[,、]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        </>
      )}

      {isComposition ? (
        <>
          <div>
            <label className="font-ja text-sm">内容の評価・解説</label>
            <Textarea
              className="mt-1 font-ja"
              rows={3}
              value={result.contentEvaluation ?? ""}
              onChange={(e) => onChange({ contentEvaluation: e.target.value })}
            />
          </div>
          <div>
            <label className="font-ja text-sm">文法・語法の評価・解説</label>
            <Textarea
              className="mt-1 font-ja"
              rows={3}
              value={result.grammarEvaluation ?? ""}
              onChange={(e) => onChange({ grammarEvaluation: e.target.value })}
            />
          </div>
          <div>
            <label className="font-ja text-sm">完成版英文</label>
            <Textarea
              className="font-en mt-1"
              rows={3}
              value={result.polishedAnswer ?? ""}
              onChange={(e) => onChange({ polishedAnswer: e.target.value })}
            />
          </div>
        </>
      ) : (
        <div>
          <label className="font-ja text-sm">解説</label>
          <Textarea
            className="mt-1 font-ja"
            rows={4}
            value={result.explanation ?? ""}
            onChange={(e) => onChange({ explanation: e.target.value })}
          />
        </div>
      )}

      <div>
        <label className="font-ja text-sm">模範解答（プリント掲載）</label>
        <Textarea
          className="font-en mt-1"
          rows={2}
          value={modelText}
          onChange={(e) => onChange({ modelAnswer: e.target.value })}
        />
      </div>
    </Card>
  );
}
