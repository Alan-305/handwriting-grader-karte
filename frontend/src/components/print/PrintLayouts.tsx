import { EnText, JaText } from "@/components/typography/Typography";
import { GradeBadge } from "@/components/grading/GradeBadge";
import { TtsButton } from "@/components/grading/ModelAnswerPanel";
import type { GradeLevel, QuestionResult } from "@/types/firestore";
import { formatQuestionScore, formatTotalScoreLabel } from "@/lib/scoring";

export function StudentPrintLayout({
  results,
  totalScore100,
}: {
  results: QuestionResult[];
  totalScore100?: number;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 bg-white p-8 print:p-0">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="font-ja text-2xl font-semibold">返却プリント</h1>
        <p className="font-ja text-sm text-slate-500">添削結果のご確認</p>
        {totalScore100 != null && (
          <p className="mt-3 font-ja text-lg font-semibold text-slate-900">
            100点満点中 {totalScore100}点
          </p>
        )}
      </header>
      {results.map((r) => (
        <section key={r.id} className="space-y-4 border-b border-slate-100 pb-8">
          <div className="flex items-center justify-between">
            <h2 className="font-ja text-lg font-semibold">
              第{r.order}問{r.partLabel ? ` ${r.partLabel}` : ""}
            </h2>
            <GradeBadge grade={r.grade as GradeLevel} />
          </div>
          <div>
            <p className="font-ja text-sm font-semibold text-slate-600">あなたの解答</p>
            <br />
            <p className="text-feedback font-en text-slate-900">{r.studentAnswerText || "—"}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="font-ja text-sm font-semibold text-slate-600">解説</p>
            <p className="text-explanation mt-2 font-ja text-slate-800">{r.explanation}</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="font-ja text-sm font-semibold text-slate-600">模範解答</p>
              <p className="text-model-answer mt-1 font-en text-slate-900">{r.modelAnswer}</p>
            </div>
            <TtsButton text={r.modelAnswer} lang="en" />
          </div>
          <p className="font-ja text-sm text-slate-600">
            得点: {formatQuestionScore(r)}
          </p>
        </section>
      ))}
    </div>
  );
}

export function TeacherPrintLayout({ results }: { results: QuestionResult[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-8 bg-white p-8 print:p-0">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="font-ja text-2xl font-semibold">教師用指導資料</h1>
        <p className="font-ja text-sm text-slate-500">対面指導のポイント</p>
      </header>
      {results.map((r) => (
        <section key={r.id} className="space-y-3 border-b border-slate-100 pb-6">
          <div className="flex items-center gap-3">
            <h2 className="font-ja text-lg font-semibold">第{r.order}問</h2>
            <GradeBadge grade={r.grade as GradeLevel} />
            {r.errorTags?.length > 0 && (
              <span className="font-ja text-xs text-slate-500">
                傾向: {r.errorTags.join("、")}
              </span>
            )}
          </div>
          <p className="font-ja text-sm">
            <JaText className="font-semibold">講評: </JaText>
            {r.feedback}
          </p>
          <p className="font-ja text-sm">
            <JaText className="font-semibold">指導ポイント: </JaText>
            {r.teacherNotes || "特記事項なし"}
          </p>
          <p className="font-en text-sm text-slate-600">{r.studentAnswerText}</p>
        </section>
      ))}
    </div>
  );
}
