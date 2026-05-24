import type { AnswerPart, GradingMode, Question } from "@/types/firestore";

function effectiveModelAnswer(
  question: Pick<Question, "modelAnswer">,
  part?: Pick<AnswerPart, "modelAnswer">,
): string {
  if (part && part.modelAnswer !== undefined) {
    return part.modelAnswer.trim();
  }
  return (question.modelAnswer ?? "").trim();
}

/** 模範解答の有無から添削プロンプト種別を判定 */
export function resolveGradingMode(
  question: Pick<Question, "modelAnswer" | "gradingMode">,
  part?: Pick<AnswerPart, "modelAnswer" | "gradingMode">,
): GradingMode {
  if (part?.gradingMode) return part.gradingMode;
  if (question.gradingMode) return question.gradingMode;

  if (!effectiveModelAnswer(question, part)) return "no_model";
  return "standard";
}

export const NO_MODEL_ANSWER_HINT =
  "模範解答が空の場合、添削時は模範解答なし用プロンプト（自由英作文など）で AI が採点します。";
