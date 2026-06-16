import { JaText } from "@/components/typography/Typography";
import { GradeBadge } from "@/components/grading/GradeBadge";
import type { GradeLevel, QuestionResult } from "@/types/firestore";
import { CompositionFeedbackSections } from "@/components/grading/CompositionFeedbackSections";
import { ComprehensiveReadingFeedbackSections } from "@/components/grading/ComprehensiveReadingFeedbackSections";
import { PreviewAnchor } from "@/components/print/PreviewAnchor";
import { PrintFlowDocument } from "@/components/print/PrintA4Page";
import { resultAnchor } from "@/lib/preview-anchor";
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
  isCompositionResult,
  isComprehensiveReadingResult,
  modelAnswerForPrint,
  passageTranslationForPrint,
  shouldShowModelAnswerPanel,
  groupQuestionResultsByOrder,
  sortQuestionResults,
  studentAnswerForPrint,
} from "@/lib/question-results";
import { formatQuestionScore } from "@/lib/scoring";
import {
  shouldApplyQuestionGap,
  shouldBreakBeforeQuestion,
} from "@/lib/print-layout-settings";
import { depersonalizeForStudentPrint, compactStudentNameForPrintHeader } from "@/lib/student-print-text";

function questionHeading(r: QuestionResult): string {
  return `第${r.order}問${r.partLabel ? ` ${r.partLabel}` : ""}`;
}

export function StudentPrintLayout({
  results,
  studentName,
  sessionNumber,
  totalScore100,
  sections,
  layout,
  includedQuestions = {},
}: {
  results: QuestionResult[];
  studentName?: string;
  /** 生徒の添削履歴における第N回（同一テストの再添削は上書き） */
  sessionNumber?: number;
  totalScore100?: number;
  sections: StudentPrintSections;
  layout: GradingPrintLayoutSettings;
  includedQuestions?: Record<string, boolean>;
}) {
  const sorted = sortQuestionResults(results).filter((r) =>
    isQuestionIncluded(includedQuestions, r.id),
  );
  const grouped = groupQuestionResultsByOrder(sorted);
  const personalize = (text?: string) =>
    text ? depersonalizeForStudentPrint(text, studentName) : text;
  const compactName = compactStudentNameForPrintHeader(studentName);
  const showScore =
    studentSectionOn(sections, "totalScore") && totalScore100 != null;
  const titlePrefix = sessionNumber != null ? `第${sessionNumber}回：` : "";

  return (
    <PrintFlowDocument
      className="print-layout-document grading-print-document"
      style={gradingPrintDocumentStyle(layout)}
      data-page-margin={layout.pageMargin}
    >
      <header className="print-doc-header border-b border-slate-200 pb-2 print:border-black">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="min-w-0 font-ja text-lg font-semibold leading-snug text-slate-900">
            {titlePrefix}添削結果と解説
            {compactName ? `（${compactName}）` : ""}
          </h1>
          {showScore ? (
            <p className="shrink-0 font-ja text-lg font-semibold text-slate-900">
              {totalScore100}点／100点満点
            </p>
          ) : null}
        </div>
      </header>

      {grouped.map((group, groupIndex) => {
        const breakBefore = shouldBreakBeforeQuestion(groupIndex, group.order, layout);
        const gapClass =
          shouldApplyQuestionGap(groupIndex, layout) ? "print-question-gap" : "";

        return (
          <div
            key={`order-${group.order}`}
            className={[
              "print-question-group",
              gapClass,
              breakBefore ? "print-break-before-page" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {group.items.map((r) => {
              const studentText = studentAnswerForPrint(r, sorted);
              const modelText = modelAnswerForPrint(r, sorted);
              const passageTranslation = passageTranslationForPrint(r, sorted);
              const composition = isCompositionResult(r);
              const comprehensive = isComprehensiveReadingResult(r, sorted);

              return (
                <PreviewAnchor
                  key={r.id}
                  anchor={resultAnchor(r.id)}
                  className="print-question-wrap print-question-block--split-ok"
                >
            <section className="grading-print-question space-y-4 border-b border-slate-100 pb-8 print:border-black/20">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h2 className="font-ja text-sm font-semibold text-slate-800">{questionHeading(r)}</h2>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  {studentSectionOn(sections, "score") && (
                    <p className="font-ja text-sm text-slate-600">
                      得点 {formatQuestionScore(r)}
                    </p>
                  )}
                  {studentSectionOn(sections, "grade") && (
                    <GradeBadge
                      grade={r.grade as GradeLevel}
                      className="min-h-9 min-w-9 px-3 text-sm"
                    />
                  )}
                </div>
              </div>

              {studentSectionOn(sections, "studentAnswer") && (
                <div className="grading-print-block">
                  <p className="font-ja text-sm font-semibold text-slate-600">あなたの解答</p>
                  <br />
                  <p className="text-feedback font-en text-slate-900">{studentText || "—"}</p>
                </div>
              )}

              {studentSectionOn(sections, "feedback") && r.feedback && !composition && !comprehensive ? (
                <p className="grading-print-block font-ja text-sm text-slate-700">
                  {personalize(r.feedback)}
                </p>
              ) : null}

              {(studentSectionOn(sections, "contentEvaluation") ||
                studentSectionOn(sections, "grammarEvaluation") ||
                studentSectionOn(sections, "polishedAnswer") ||
                (studentSectionOn(sections, "feedback") && composition)) &&
              composition ? (
                <CompositionFeedbackSections
                  summary={
                    studentSectionOn(sections, "feedback") ? personalize(r.feedback) : undefined
                  }
                  contentEvaluation={
                    studentSectionOn(sections, "contentEvaluation")
                      ? personalize(r.contentEvaluation)
                      : undefined
                  }
                  grammarEvaluation={
                    studentSectionOn(sections, "grammarEvaluation")
                      ? personalize(r.grammarEvaluation)
                      : undefined
                  }
                  polishedAnswer={
                    studentSectionOn(sections, "polishedAnswer") ? r.polishedAnswer : undefined
                  }
                />
              ) : comprehensive ? (
                <ComprehensiveReadingFeedbackSections
                  summary={
                    studentSectionOn(sections, "feedback") ? personalize(r.feedback) : undefined
                  }
                  explanation={
                    studentSectionOn(sections, "explanation")
                      ? personalize(r.explanation)
                      : undefined
                  }
                  modelAnswer={
                    studentSectionOn(sections, "modelAnswer") && modelText ? modelText : undefined
                  }
                  passageTranslation={
                    studentSectionOn(sections, "modelAnswerTranslation")
                      ? passageTranslation
                      : undefined
                  }
                />
              ) : studentSectionOn(sections, "explanation") && r.explanation ? (
                <div className="grading-print-block rounded-xl bg-slate-50 p-4 print:bg-transparent print:p-0">
                  <p className="font-ja text-sm font-semibold text-slate-600">解説</p>
                  <p className="text-explanation mt-2 whitespace-pre-line font-ja text-slate-800">
                    {personalize(r.explanation)}
                  </p>
                </div>
              ) : null}

              {studentSectionOn(sections, "modelAnswer") &&
              shouldShowModelAnswerPanel(r, sorted) &&
              !comprehensive &&
              modelText ? (
                <div className="grading-print-block">
                  <p className="font-ja text-sm font-semibold text-slate-600">模範解答</p>
                  <p className="text-explanation mt-1 font-en text-slate-900">{modelText}</p>
                </div>
              ) : null}

              {studentSectionOn(sections, "modelAnswerTranslation") &&
              !comprehensive &&
              passageTranslation ? (
                <div className="grading-print-block">
                  <p className="font-ja text-sm font-semibold text-slate-600">全訳</p>
                  <p className="text-explanation mt-2 whitespace-pre-line font-ja text-slate-800">
                    {personalize(passageTranslation)}
                  </p>
                </div>
              ) : null}

            </section>
                </PreviewAnchor>
              );
            })}
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
  const grouped = groupQuestionResultsByOrder(sorted);

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

      {grouped.map((group, groupIndex) => {
        const breakBefore = shouldBreakBeforeQuestion(groupIndex, group.order, layout);
        const gapClass =
          shouldApplyQuestionGap(groupIndex, layout) ? "print-question-gap" : "";

        return (
          <div
            key={`order-${group.order}`}
            className={[
              "print-question-group",
              gapClass,
              breakBefore ? "print-break-before-page" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {group.items.map((r) => {
              const studentText = studentAnswerForPrint(r, sorted);
              const modelText = modelAnswerForPrint(r, sorted);
              const passageTranslation = passageTranslationForPrint(r, sorted);
              const composition = isCompositionResult(r);
              const comprehensive = isComprehensiveReadingResult(r, sorted);

              return (
                <PreviewAnchor
                  key={r.id}
                  anchor={resultAnchor(r.id)}
                  className="print-question-wrap print-question-block--split-ok"
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

              {teacherSectionOn(sections, "feedback") && !composition && !comprehensive && (
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
                teacherSectionOn(sections, "polishedAnswer") ||
                (teacherSectionOn(sections, "feedback") && composition)) &&
              composition ? (
                <CompositionFeedbackSections
                  summary={teacherSectionOn(sections, "feedback") ? r.feedback : undefined}
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
                />
              ) : comprehensive ? (
                <ComprehensiveReadingFeedbackSections
                  summary={teacherSectionOn(sections, "feedback") ? r.feedback : undefined}
                  explanation={
                    teacherSectionOn(sections, "explanation") ? r.explanation : undefined
                  }
                  modelAnswer={
                    teacherSectionOn(sections, "modelAnswer") && modelText ? modelText : undefined
                  }
                  passageTranslation={
                    teacherSectionOn(sections, "modelAnswer") ? passageTranslation : undefined
                  }
                />
              ) : teacherSectionOn(sections, "explanation") && r.explanation ? (
                <div className="grading-print-block">
                  <p className="font-ja text-sm font-semibold text-slate-600">解説</p>
                  <p className="text-explanation mt-2 whitespace-pre-line font-ja text-slate-800">{r.explanation}</p>
                </div>
              ) : null}

              {teacherSectionOn(sections, "modelAnswer") &&
              shouldShowModelAnswerPanel(r, sorted) &&
              !comprehensive &&
              modelText ? (
                <div className="grading-print-block">
                  <p className="font-ja text-sm font-semibold text-slate-600">模範解答</p>
                  <p className="text-model-answer mt-1 font-en text-slate-900">{modelText}</p>
                </div>
              ) : null}
            </section>
                </PreviewAnchor>
              );
            })}
          </div>
        );
      })}
    </PrintFlowDocument>
  );
}
