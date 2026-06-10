import { describe, expect, it } from "vitest";
import { dedupeQuestionResults } from "./question-results";
import type { QuestionResult } from "@/types/firestore";

function row(
  id: string,
  questionId: string,
  partIndex: number,
  graded = false,
): QuestionResult {
  return {
    id,
    questionId,
    order: 3,
    partIndex,
    partLabel: `(${partIndex + 1})`,
    type: "english",
    croppedImagePath: "",
    modelAnswer: "",
    graded,
    createdAt: { toMillis: () => 0 } as QuestionResult["createdAt"],
  };
}

describe("dedupeQuestionResults", () => {
  it("keeps one row per questionId/partIndex and prefers graded", () => {
    const input = [
      row("dup-a", "q3", 4, true),
      row("dup-b", "q3", 4, false),
      row("dup-c", "q3", 5, true),
      row("dup-d", "q3", 5, false),
      row("solo", "q4", 0, true),
    ];
    const out = dedupeQuestionResults(input);
    expect(out.map((r) => r.id).sort()).toEqual(["dup-a", "dup-c", "solo"]);
  });
});
