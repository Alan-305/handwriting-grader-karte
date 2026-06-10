import { PrintFlowDocument } from "@/components/print/PrintA4Page";
import { QuestionPromptBlock } from "@/lib/question-text-format";
import {
  printLayoutDocumentStyle,
  shouldApplyQuestionGap,
  shouldBreakBeforeQuestion,
  type PrintLayoutSettings,
} from "@/lib/print-layout-settings";
import {
  extractPassageTranslation,
  questionHasEnglishPassage,
  splitModelAnswerSections,
  unitHeading,
} from "@/lib/model-answer-sections";
import type { AnswerKeyUnit } from "@/lib/test-answer-key";
import type { Question } from "@/types/firestore";

export interface AnswerKeyPrintSections {
  body: boolean;
  vocabulary: boolean;
  /** 本文の全訳（英語長文がある設問）／その他の全訳 */
  passageTranslation: boolean;
  prompt: boolean;
}

export const DEFAULT_ANSWER_KEY_PRINT_SECTIONS: AnswerKeyPrintSections = {
  body: true,
  vocabulary: true,
  passageTranslation: true,
  prompt: false,
};

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <div className="print-break-avoid space-y-2">
      <h3 className="font-ja text-sm font-semibold text-slate-700">{title}</h3>
      <div className="text-explanation leading-relaxed text-slate-900">{children}</div>
    </div>
  );
}

export function TeacherAnswerKeyPrintLayout({
  testTitle,
  questions,
  units,
  settings,
  sections,
  passageTranslations = {},
}: {
  testTitle: string;
  questions: Question[];
  units: AnswerKeyUnit[];
  settings: PrintLayoutSettings;
  sections: AnswerKeyPrintSections;
  /** 編集画面で入力した本文全訳（questionId → テキスト） */
  passageTranslations?: Record<string, string>;
}) {
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const unitsByQuestion = new Map<string, AnswerKeyUnit[]>();
  for (const unit of units) {
    const list = unitsByQuestion.get(unit.questionId) ?? [];
    list.push(unit);
    unitsByQuestion.set(unit.questionId, list);
  }

  const renderedQuestionIds = new Set<string>();

  return (
    <PrintFlowDocument
      className="print-layout-document"
      data-section-mode={settings.sectionMode}
      data-page-margin={settings.pageMargin}
      style={printLayoutDocumentStyle(settings)}
    >
      <header className="print-doc-header border-b-2 border-slate-800 pb-5 text-center print:border-black">
        <h1 className="font-ja text-2xl font-semibold">{testTitle}</h1>
        <p className="mt-2 font-ja text-base text-slate-700">解答・解説・全訳（教師用）</p>
      </header>

      {units.map((unit, index) => {
        const question = questionById.get(unit.questionId);
        if (!question) return null;

        const parsed = splitModelAnswerSections(unit.modelAnswer);
        const isFirstForQuestion = !renderedQuestionIds.has(unit.questionId);
        if (isFirstForQuestion) renderedQuestionIds.add(unit.questionId);

        const questionUnits = unitsByQuestion.get(unit.questionId) ?? [unit];
        const storedTranslation =
          passageTranslations[unit.questionId]?.trim() ||
          extractPassageTranslation(
            question,
            questionUnits.map((u) => u.modelAnswer),
          );
        const showPassageTranslation =
          sections.passageTranslation && Boolean(storedTranslation);
        const translationTitle = questionHasEnglishPassage(question)
          ? "本文の全訳"
          : "全訳";

        const hasContent =
          parsed.body ||
          parsed.vocabulary ||
          (isFirstForQuestion && showPassageTranslation) ||
          (sections.prompt && isFirstForQuestion && question.prompt);

        if (!hasContent && !unit.modelAnswer.trim()) return null;

        const breakBefore = shouldBreakBeforeQuestion(index, settings.sectionMode);
        const applyGap = shouldApplyQuestionGap(index, settings.sectionMode);

        return (
          <div
            key={unit.key}
            className={[
              "print-question-wrap print-question-block",
              breakBefore ? "print-break-before-page" : "",
              applyGap ? "print-question-gap" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <section className="print-break-avoid space-y-4 border-b border-slate-200 pb-6 print:border-black/20">
              <h2 className="font-ja text-lg font-semibold">
                {unitHeading(unit.order, unit.partLabel)}
              </h2>

              {isFirstForQuestion && sections.prompt && question.prompt ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 print:border-black/20 print:bg-transparent">
                  <p className="mb-2 font-ja text-sm font-semibold text-slate-600">問題文</p>
                  <QuestionPromptBlock prompt={question.prompt} />
                </div>
              ) : null}

              <div className="space-y-5">
                {sections.body && parsed.body ? (
                  <SectionBlock title="解答・解説">
                    <p className="whitespace-pre-wrap font-ja">{parsed.body}</p>
                  </SectionBlock>
                ) : null}
                {sections.vocabulary && parsed.vocabulary ? (
                  <SectionBlock title="重要語句">
                    <p className="whitespace-pre-wrap font-ja">{parsed.vocabulary}</p>
                  </SectionBlock>
                ) : null}
              </div>

              {isFirstForQuestion && showPassageTranslation ? (
                <SectionBlock title={translationTitle}>
                  <p className="whitespace-pre-wrap font-ja">{storedTranslation}</p>
                </SectionBlock>
              ) : null}

              {!unit.modelAnswer.trim() &&
              isFirstForQuestion &&
              questionHasEnglishPassage(question) &&
              !storedTranslation ? (
                <p className="font-ja text-sm text-slate-400">（本文の全訳未入力）</p>
              ) : null}
              {!unit.modelAnswer.trim() && !questionHasEnglishPassage(question) ? (
                <p className="font-ja text-sm text-slate-400">（模範解答未入力）</p>
              ) : null}
            </section>
          </div>
        );
      })}

      <p className="print-break-avoid mt-6 text-center font-ja text-xs text-slate-500">
        ― 解答・解説・全訳 ここまで ―
      </p>
    </PrintFlowDocument>
  );
}
