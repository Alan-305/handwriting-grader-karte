import { TtsButton } from "@/components/grading/ModelAnswerPanel";
import { PrintFlowDocument } from "@/components/print/PrintA4Page";
import { QuestionPromptBlock } from "@/lib/question-text-format";
import {
  printLayoutDocumentStyle,
  shouldApplyQuestionGap,
  shouldBreakBeforeQuestion,
  type PrintLayoutSettings,
} from "@/lib/print-layout-settings";
import {
  splitModelAnswerSections,
  unitHeading,
  type ModelAnswerSections,
} from "@/lib/model-answer-sections";
import type { AnswerKeyUnit } from "@/lib/test-answer-key";
import type { Question } from "@/types/firestore";

export interface AnswerKeyPrintSections {
  body: boolean;
  vocabulary: boolean;
  translation: boolean;
  prompt: boolean;
}

export const DEFAULT_ANSWER_KEY_PRINT_SECTIONS: AnswerKeyPrintSections = {
  body: true,
  vocabulary: true,
  translation: true,
  prompt: false,
};

function SectionBlock({
  title,
  children,
  ttsText,
  ttsLang = "ja",
}: {
  title: string;
  children: React.ReactNode;
  ttsText?: string;
  ttsLang?: "en" | "ja";
}) {
  if (!children) return null;
  return (
    <div className="print-break-avoid space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-ja text-sm font-semibold text-slate-700">{title}</h3>
        {ttsText ? (
          <span className="no-print">
            <TtsButton text={ttsText} lang={ttsLang} />
          </span>
        ) : null}
      </div>
      <div className="text-explanation leading-relaxed text-slate-900">{children}</div>
    </div>
  );
}

function RenderSections({
  sections,
  parsed,
}: {
  sections: AnswerKeyPrintSections;
  parsed: ModelAnswerSections;
}) {
  return (
    <div className="space-y-5">
      {sections.body && parsed.body ? (
        <SectionBlock title="解答・解説" ttsText={parsed.body} ttsLang="ja">
          <p className="whitespace-pre-wrap font-ja">{parsed.body}</p>
        </SectionBlock>
      ) : null}
      {sections.vocabulary && parsed.vocabulary ? (
        <SectionBlock title="重要語句" ttsText={parsed.vocabulary} ttsLang="ja">
          <p className="whitespace-pre-wrap font-ja">{parsed.vocabulary}</p>
        </SectionBlock>
      ) : null}
      {sections.translation && parsed.translation ? (
        <SectionBlock title="全訳" ttsText={parsed.translation} ttsLang="ja">
          <p className="whitespace-pre-wrap font-ja">{parsed.translation}</p>
        </SectionBlock>
      ) : null}
    </div>
  );
}

export function TeacherAnswerKeyPrintLayout({
  testTitle,
  questions,
  units,
  settings,
  sections,
}: {
  testTitle: string;
  questions: Question[];
  units: AnswerKeyUnit[];
  settings: PrintLayoutSettings;
  sections: AnswerKeyPrintSections;
}) {
  const questionById = new Map(questions.map((q) => [q.id, q]));

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
        const parsed = splitModelAnswerSections(unit.modelAnswer);
        const hasContent =
          (sections.body && parsed.body) ||
          (sections.vocabulary && parsed.vocabulary) ||
          (sections.translation && parsed.translation) ||
          (sections.prompt && question?.prompt);

        if (!hasContent) return null;

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

              {sections.prompt && question?.prompt ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 print:border-black/20 print:bg-transparent">
                  <p className="mb-2 font-ja text-sm font-semibold text-slate-600">問題文</p>
                  <QuestionPromptBlock prompt={question.prompt} />
                </div>
              ) : null}

              <RenderSections sections={sections} parsed={parsed} />

              {!unit.modelAnswer.trim() ? (
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
