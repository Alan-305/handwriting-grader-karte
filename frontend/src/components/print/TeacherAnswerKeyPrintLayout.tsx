import { PreviewAnchor } from "@/components/print/PreviewAnchor";
import { PrintFlowDocument } from "@/components/print/PrintA4Page";
import {
  questionAnchor,
  questionPassageAnchor,
  questionUnitAnchor,
} from "@/lib/preview-anchor";
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
    <div className="space-y-2">
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
  const unitsByQuestion = new Map<string, AnswerKeyUnit[]>();
  for (const unit of units) {
    const list = unitsByQuestion.get(unit.questionId) ?? [];
    list.push(unit);
    unitsByQuestion.set(unit.questionId, list);
  }

  const orderedQuestions = questions.filter((q) => (unitsByQuestion.get(q.id)?.length ?? 0) > 0);

  return (
    <PrintFlowDocument
      className="print-layout-document print-flow-document--answer-key"
      data-section-mode={settings.sectionMode}
      data-page-margin={settings.pageMargin}
      style={printLayoutDocumentStyle(settings)}
    >
      <header className="print-doc-header border-b-2 border-slate-800 pb-5 text-center print:border-black">
        <h1 className="font-ja text-2xl font-semibold">{testTitle}</h1>
        <p className="mt-2 font-ja text-base text-slate-700">解答・解説・全訳（教師用）</p>
      </header>

      {orderedQuestions.map((question, questionIndex) => {
        const questionUnits = unitsByQuestion.get(question.id) ?? [];
        const storedTranslation =
          passageTranslations[question.id]?.trim() ||
          extractPassageTranslation(
            question,
            questionUnits.map((u) => u.modelAnswer),
          );
        const showPassageTranslation =
          sections.passageTranslation && Boolean(storedTranslation);
        const translationTitle = questionHasEnglishPassage(question)
          ? "本文の全訳"
          : "全訳";
        const hasMultipleParts = questionUnits.length > 1;

        const hasContent =
          questionUnits.some((unit) => {
            const parsed = splitModelAnswerSections(unit.modelAnswer);
            return parsed.body || parsed.vocabulary;
          }) ||
          showPassageTranslation ||
          (sections.prompt && question.prompt);

        if (!hasContent) return null;

        const breakBefore = shouldBreakBeforeQuestion(questionIndex, question.order, settings);
        const applyGap = shouldApplyQuestionGap(questionIndex, settings);

        return (
          <PreviewAnchor
            key={question.id}
            anchor={questionAnchor(question.id)}
            className={[
              "print-question-wrap print-question-block--split-ok",
              breakBefore ? "print-break-before-page" : "",
              applyGap ? "print-question-gap" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <section className="space-y-5 border-b border-slate-200 pb-6 print:border-black/20">
              <h2 className="font-ja text-lg font-semibold">第{question.order}問</h2>

              {sections.prompt && question.prompt ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 print:border-black/20 print:bg-transparent">
                  <p className="mb-2 font-ja text-sm font-semibold text-slate-600">問題文</p>
                  <QuestionPromptBlock prompt={question.prompt} />
                </div>
              ) : null}

              {questionUnits.map((unit) => {
                const parsed = splitModelAnswerSections(unit.modelAnswer);
                const unitHasContent = parsed.body || parsed.vocabulary;
                if (!unitHasContent && hasMultipleParts) return null;

                return (
                  <PreviewAnchor key={unit.key} anchor={questionUnitAnchor(question.id, unit.key)} className="space-y-4">
                    {hasMultipleParts ? (
                      <h3 className="font-ja text-base font-semibold text-slate-800">
                        {unitHeading(unit.order, unit.partLabel)}
                      </h3>
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

                    {!unit.modelAnswer.trim() && !hasMultipleParts ? (
                      <p className="font-ja text-sm text-slate-400">（模範解答未入力）</p>
                    ) : null}
                  </PreviewAnchor>
                );
              })}

              {showPassageTranslation ? (
                <PreviewAnchor
                  anchor={questionPassageAnchor(question.id)}
                  className="mt-2 rounded-lg border-2 border-slate-300 bg-slate-50/80 p-5 print:border-black/30 print:bg-transparent"
                >
                  <SectionBlock title={translationTitle}>
                    <p className="whitespace-pre-wrap font-ja">{storedTranslation}</p>
                  </SectionBlock>
                </PreviewAnchor>
              ) : null}

              {questionHasEnglishPassage(question) && !storedTranslation ? (
                <p className="font-ja text-sm text-slate-400">（本文の全訳未入力）</p>
              ) : null}
            </section>
          </PreviewAnchor>
        );
      })}

      <p className="print-break-avoid mt-6 text-center font-ja text-xs text-slate-500">
        ― 解答・解説・全訳 ここまで ―
      </p>
    </PrintFlowDocument>
  );
}
