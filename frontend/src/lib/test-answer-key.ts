import {
  answerBodyWithoutPassageTranslation,
  extractPassageTranslation,
  mergeModelAnswerSections,
  questionHasEnglishPassage,
  splitModelAnswerSections,
} from "@/lib/model-answer-sections";
import {
  isAiPassageTranslationRecommended,
  shouldShowPassageTranslationSection,
  toPassageTranslationQuestionLike,
} from "@/lib/passage-translation-policy";
import type { AnswerPart, Question } from "@/types/firestore";

export interface AnswerKeyUnit {
  key: string;
  questionId: string;
  order: number;
  partIndex: number;
  partLabel?: string;
  modelAnswer: string;
}

export function expandAnswerKeyUnits(questions: Question[]): AnswerKeyUnit[] {
  const units: AnswerKeyUnit[] = [];
  for (const q of questions) {
    if (q.answerParts && q.answerParts.length > 0) {
      q.answerParts.forEach((part, partIndex) => {
        units.push({
          key: `${q.id}-${partIndex}`,
          questionId: q.id,
          order: q.order,
          partIndex,
          partLabel: part.label,
          modelAnswer:
            part.modelAnswer ??
            (partIndex === 0 ? q.modelAnswer : "") ??
            "",
        });
      });
      continue;
    }
    units.push({
      key: q.id,
      questionId: q.id,
      order: q.order,
      partIndex: 0,
      modelAnswer: q.modelAnswer ?? "",
    });
  }
  return units;
}

export function applyAnswerKeyUnitsToQuestions(
  questions: Question[],
  units: AnswerKeyUnit[],
): Question[] {
  const byQuestion = new Map<string, AnswerKeyUnit[]>();
  for (const unit of units) {
    const list = byQuestion.get(unit.questionId) ?? [];
    list.push(unit);
    byQuestion.set(unit.questionId, list);
  }

  return questions.map((q) => {
    const rowUnits = byQuestion.get(q.id);
    if (!rowUnits?.length) return q;

    if (q.answerParts && q.answerParts.length > 0) {
      const answerParts: AnswerPart[] = q.answerParts.map((part, partIndex) => {
        const match = rowUnits.find((u) => u.partIndex === partIndex);
        return match ? { ...part, modelAnswer: match.modelAnswer } : part;
      });
      return { ...q, answerParts };
    }

    return { ...q, modelAnswer: rowUnits[0]?.modelAnswer ?? q.modelAnswer };
  });
}

export interface AnswerKeyDraftState {
  bodyByKey: Record<string, string>;
  passageByQuestion: Record<string, string>;
}

export function initAnswerKeyDraftState(questions: Question[]): AnswerKeyDraftState {
  const units = expandAnswerKeyUnits(questions);
  const bodyByKey: Record<string, string> = {};
  const passageByQuestion: Record<string, string> = {};

  for (const q of questions) {
    const qUnits = units.filter((u) => u.questionId === q.id);
    const modelAnswers = qUnits.map((u) => u.modelAnswer);
    const extracted = extractPassageTranslation(q, modelAnswers);
    if (questionHasEnglishPassage(q) || extracted) {
      passageByQuestion[q.id] = extracted;
    }
    for (const unit of qUnits) {
      bodyByKey[unit.key] = answerBodyWithoutPassageTranslation(unit.modelAnswer);
    }
  }

  return { bodyByKey, passageByQuestion };
}

/** 編集ドラフトから保存用 modelAnswer を組み立てる */
export function buildAnswerKeyUnitsFromDraft(
  questions: Question[],
  draft: AnswerKeyDraftState,
): AnswerKeyUnit[] {
  const base = expandAnswerKeyUnits(questions);
  return base.map((unit) => {
    const question = questions.find((q) => q.id === unit.questionId);
    if (!question) return unit;

    const qUnits = base.filter((u) => u.questionId === unit.questionId);
    const isFirst = qUnits[0]?.key === unit.key;
    const body = draft.bodyByKey[unit.key] ?? "";

    if (!isFirst) {
      return { ...unit, modelAnswer: body.trim() };
    }

    const passage = draft.passageByQuestion[unit.questionId] ?? "";
    const needsPassage =
      questionHasEnglishPassage(question) || Boolean(passage.trim());
    const modelAnswer = needsPassage
      ? mergeModelAnswerSections(body, passage)
      : body.trim();

    return { ...unit, modelAnswer };
  });
}

/** 【全訳】を含むテキストなら全訳を取り除いた本文を返す（含まなければそのまま） */
function stripTranslationIfPresent(text: string | undefined): string | undefined {
  if (!text) return text;
  const { translation } = splitModelAnswerSections(text);
  if (!translation.trim()) return text;
  return answerBodyWithoutPassageTranslation(text);
}

export interface QuestionsWithTranslations {
  questions: Question[];
  /** questionId → 全訳本文（見出しなし） */
  translations: Record<string, string>;
}

/**
 * 各設問の modelAnswer / 小問から【全訳】を抜き出し、
 * 編集画面用に「解答・解説」と「全訳」へ分離する
 */
export function stripPassageTranslationsFromQuestions(
  questions: Question[],
): QuestionsWithTranslations {
  const translations: Record<string, string> = {};

  const stripped = questions.map((q) => {
    const units = expandAnswerKeyUnits([q]);
    const extracted = extractPassageTranslation(
      q,
      units.map((u) => u.modelAnswer),
    );
    if (!extracted.trim()) return q;

    translations[q.id] = extracted;

    if (q.answerParts && q.answerParts.length > 0) {
      return {
        ...q,
        modelAnswer: stripTranslationIfPresent(q.modelAnswer) ?? q.modelAnswer,
        answerParts: q.answerParts.map((part) => ({
          ...part,
          modelAnswer: stripTranslationIfPresent(part.modelAnswer),
        })),
      };
    }
    return { ...q, modelAnswer: stripTranslationIfPresent(q.modelAnswer) ?? "" };
  });

  return { questions: stripped, translations };
}

/**
 * 分離していた全訳を保存用に modelAnswer へ戻す
 * （最初の解答欄の末尾に【全訳】付きで結合。表示時は常に最後の別枠に出る）
 */
export function mergePassageTranslationsIntoQuestions(
  questions: Question[],
  translations: Record<string, string>,
): Question[] {
  return questions.map((q) => {
    const passage = (translations[q.id] ?? "").trim();
    if (!passage) return q;

    if (q.answerParts && q.answerParts.length > 0) {
      const answerParts = q.answerParts.map((part, index) =>
        index === 0
          ? { ...part, modelAnswer: mergeModelAnswerSections(part.modelAnswer ?? "", passage) }
          : part,
      );
      return { ...q, answerParts };
    }
    return { ...q, modelAnswer: mergeModelAnswerSections(q.modelAnswer ?? "", passage) };
  });
}

export function questionShowsPassageTranslationField(
  question: Question,
  passageText: string,
): boolean {
  return shouldShowPassageTranslationSection(question, passageText);
}

/** AI による本文全訳の生成が必要か */
export function questionNeedsAiPassageTranslation(
  question: Question,
  passageText: string,
): boolean {
  return (
    isAiPassageTranslationRecommended(toPassageTranslationQuestionLike(question)) &&
    !passageText.trim()
  );
}
