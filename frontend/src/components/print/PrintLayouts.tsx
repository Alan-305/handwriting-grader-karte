import { JaText } from "@/components/typography/Typography";
import { GradeBadge } from "@/components/grading/GradeBadge";
import { TtsButton } from "@/components/grading/ModelAnswerPanel";
import type { GradeLevel, QuestionResult } from "@/types/firestore";
import { CompositionFeedbackSections } from "@/components/grading/CompositionFeedbackSections";
import { PrintFlowDocument } from "@/components/print/PrintA4Page";
import {
  gradingPrintDocumentStyle,
  isQuestionIncluded,
  studentSectionOn,
  teacherSectionOn,
  type GradingPrintLayoutSettings,
  type StudentPrintSections,
  type TeacherPrintSections,
} from "@/lib/grading-print-config";
import {
  modelAnswerForPrint,
  sortQuestionResults,
  studentAnswerForPrint,
} from "@/lib/question-results";
import { formatQuestionScore } from "@/lib/scoring";
import {
  shouldApplyQuestionGap,
  shouldBreakBeforeQuestion,
} from "@/lib/print-layout-settings";

function questionHeading(r: QuestionResult): string {
  return `第${r.order}問${r.partLabel ? ` ${r.partLabel}` : ""}`;
}

export function StudentPrintLayout({
  results,
  totalScore100,
  sections,
  layout,
  includedQuestions = {},
}: {
  results: QuestionResult[];
  totalScore100?: number;
  sections: StudentPrintSections;
  layout: GradingPrintLayoutSettings;
  includedQuestions?: Record<string, boolean>;
}) {
  const sorted = sortQuestionResults(results).filter((r) =>
    isQuestionIncluded(includedQuestions, r.id),
  );

  return (
    <PrintFlowDocument
      className="print-layout-document grading-print-document"
      style={gradingPrintDocumentStyle(layout)}
      data-page-margin={layout.pageMargin}
    >
      <header className="print-doc-header border-b border-slate-200 pb-4 print:border-black">
        <h1 className="font-ja text-2xl font-semibold">返却プリント</h1>
        <p className="font-ja text-sm text-slate-500">添削結果のご確認</p>
        {studentSectionOn(sections, "totalScore") && totalScore100 != null && (
          <p className="mt-3 font-ja text-lg font-semibold text-slate-900">
            100点満点中 {totalScore100}点
          </p>
        )}
      </header>

      {sorted.map((r, index) => {
        const studentText = studentAnswerForPrint(r, sorted);
        const modelText = modelAnswerForPrint(r, sorted);
        const breakBefore = shouldBreakBeforeQuestion(index, layout.sectionMode);
        const gapClass =
          shouldApplyQuestionGap(index, layout.sectionMode) ? "print-question-gap" : "";

        return (
          <div
            key={r.id}
            className={`print-question-wrap print-question-block ${gapClass} ${breakBefore ? "print-break-before-page" : ""}`}
          >
            <section className="grading-print-question space-y-4 border-b border-slate-100 pb-8 print:border-black/20">
              <div className="flex items-center justify-between">
                <h2 className="font-ja text-lg font-semibold">{questionHeading(r)}</h2>
                {studentSectionOn(sections, "grade") && (
                  <GradeBadge grade={r.grade as GradeLevel} />
                )}
              </div>

              {studentSectionOn(sections, "studentAnswer") && (
                <div className="grading-print-block">
                  <p className="font-ja text-sm font-semibold text-slate-600">あなたの解答</p>
                  <br />
                  <p className="text-feedback font-en text-slate-900">{studentText || "—"}</p>
                </div>
              )}

              {studentSectionOn(sections, "feedback") && r.feedback ? (
                <p className="grading-print-block font-ja text-sm text-slate-700">{r.feedback}</p>
              ) : null}

              {(studentSectionOn(sections, "contentEvaluation") ||
                studentSectionOn(sections, "grammarEvaluation") ||
                studentSectionOn(sections, "polishedAnswer")) &&
              (r.contentEvaluation || r.grammarEvaluation || r.polishedAnswer) ? (
                <CompositionFeedbackSections
                  contentEvaluation={
                    studentSectionOn(sections, "contentEvaluation")
                      ? r.contentEvaluation
                      : undefined
                  }
                  grammarEvaluation={
                    studentSectionOn(sections, "grammarEvaluation")
                      ? r.grammarEvaluation
                      : undefined
                  }
                  polishedAnswer={
                    studentSectionOn(sections, "polishedAnswer") ? r.polishedAnswer : undefined
                  }
                  hideTtsOnPrint
                />
              ) : studentSectionOn(sections, "explanation") && r.explanation ? (
                <div className="grading-print-block rounded-xl bg-slate-50 p-4 print:bg-transparent print:p-0">
                  <p className="font-ja text-sm font-semibold text-slate-600">解説</p>
                  <p className="text-explanation mt-2 font-ja text-slate-800">{r.explanation}</p>
                </div>
              ) : null}

              {studentSectionOn(sections, "modelAnswer") &&
              !r.polishedAnswer &&
              modelText ? (
                <div className="grading-print-block flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-ja text-sm font-semibold text-slate-600">模範解答</p>
                    <p className="text-model-answer mt-1 font-en text-slate-900">{modelText}</p>
                  </div>
                  <span className="no-print">
                    <TtsButton text={modelText} lang="en" />
                  </span>
                </div>
              ) : null}

              {studentSectionOn(sections, "score") && (
                <p className="grading-print-block font-ja text-sm text-slate-600">
                  得点: {formatQuestionScore(r)}
                </p>
              )}
            </section>
          </div>
        );
      })}
    </PrintFlowDocument>
  );
}

export function TeacherPrintLayout({
  results,
  sections,
  layout,
  includedQuestions = {},
}: {
  results: QuestionResult[];
  sections: TeacherPrintSections;
  layout: GradingPrintLayoutSettings;
  includedQuestions?: Record<string, boolean>;
}) {
  const sorted = sortQuestionResults(results).filter((r) =>
    isQuestionIncluded(includedQuestions, r.id),
  );

  return (
    <PrintFlowDocument
      className="print-layout-document grading-print-document"
      style={gradingPrintDocumentStyle(layout)}
      data-page-margin={layout.pageMargin}
    >
      <header className="print-doc-header border-b border-slate-200 pb-4 print:border-black">
        <h1 className="font-ja text-2xl font-semibold">教師用指導資料</h1>
        <p className="font-ja text-sm text-slate-500">対面指導のポイント</p>
      </header>

      {sorted.map((r, index) => {
        const studentText = studentAnswerForPrint(r, sorted);
        const modelText = modelAnswerForPrint(r, sorted);
        const breakBefore = shouldBreakBeforeQuestion(index, layout.sectionMode);
        const gapClass =
          shouldApplyQuestionGap(index, layout.sectionMode) ? "print-question-gap" : "";

        return (
          <div
            key={r.id}
            className={`print-question-wrap print-question-block ${gapClass} ${breakBefore ? "print-break-before-page" : ""}`}
          >
            <section className="grading-print-question space-y-3 border-b border-slate-100 pb-6 print:border-black/20">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-ja text-lg font-semibold">{questionHeading(r)}</h2>
                {teacherSectionOn(sections, "grade") && (
                  <GradeBadge grade={r.grade as GradeLevel} />
                )}
                {teacherSectionOn(sections, "errorTags") && (r.errorTags?.length ?? 0) > 0 && (
                  <span className="font-ja text-xs text-slate-500">
                    傾向: {r.errorTags?.join("、")}
                  </span>
                )}
              </div>

              {teacherSectionOn(sections, "feedback") && (
                <p className="grading-print-block font-ja text-sm">
                  <JaText className="font-semibold">講評: </JaText>
                  {r.feedback || "—"}
                </p>
              )}

              {teacherSectionOn(sections, "teacherNotes") && (
                <p className="grading-print-block font-ja text-sm">
                  <JaText className="font-semibold">指導ポイント: </JaText>
                  {r.teacherNotes || "特記事項なし"}
                </p>
              )}

              {teacherSectionOn(sections, "studentAnswer") && (
                <p className="grading-print-block font-en text-sm text-slate-600">
                  {studentText || "—"}
                </p>
              )}

              {(teacherSectionOn(sections, "contentEvaluation") ||
                teacherSectionOn(sections, "grammarEvaluation") ||
                teacherSectionOn(sections, "polishedAnswer")) &&
              (r.contentEvaluation || r.grammarEvaluation || r.polishedAnswer) ? (
                <CompositionFeedbackSections
                  contentEvaluation={
                    teacherSectionOn(sections, "contentEvaluation")
                      ? r.contentEvaluation
                      : undefined
                  }
                  grammarEvaluation={
                    teacherSectionOn(sections, "grammarEvaluation")
                      ? r.grammarEvaluation
                      : undefined
                  }
                  polishedAnswer={
                    teacherSectionOn(sections, "polishedAnswer") ? r.polishedAnswer : undefined
                  }
                  hideTtsOnPrint
                />
              ) : teacherSectionOn(sections, "explanation") && r.explanation ? (
                <div className="grading-print-block">
                  <p className="font-ja text-sm font-semibold text-slate-600">解説</p>
                  <p className="text-explanation mt-2 font-ja text-slate-800">{r.explanation}</p>
                </div>
              ) : null}

              {teacherSectionOn(sections, "modelAnswer") && modelText ? (
                <div className="grading-print-block">
                  <p className="font-ja text-sm font-semibold text-slate-600">模範解答</p>
                  <p className="text-model-answer mt-1 font-en text-slate-900">{modelText}</p>
                </div>
              ) : null}
            </section>
          </div>
        );
      })}
    </PrintFlowDocument>
  );
}
