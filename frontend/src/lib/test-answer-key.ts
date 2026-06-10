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
