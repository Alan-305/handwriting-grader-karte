import { describe, expect, it } from "vitest";
import {
  dedupeQuestionResults,
  modelAnswerForPrint,
  passageTranslationForPrint,
  textForPart,
} from "./question-results";
import type { QuestionResult } from "@/types/firestore";

function row(
  id: string,
  questionId: string,
  partIndex: number,
  graded = false,
  modelAnswer = "",
): QuestionResult {
  return {
    id,
    questionId,
    order: 3,
    partIndex,
    partLabel: `(${partIndex + 1})`,
    type: "english",
    croppedImagePath: "",
    modelAnswer,
    graded,
    createdAt: { toMillis: () => 0 } as QuestionResult["createdAt"],
  };
}

const sharedModelAnswer = `(1) First answer
(2) Second answer

【全訳】
これは本文の全訳です。`;

describe("dedupeQuestionResults", () => {
  it("keeps one row per questionId/partIndex and prefers graded", () => {
    const input = [
      row("dup-a", "q3", 0, true),
      row("dup-b", "q3", 0, false),
      row("dup-c", "q3", 1, true),
      row("dup-d", "q3", 1, false),
      row("solo", "q4", 0, true),
    ];
    const out = dedupeQuestionResults(input);
    expect(out.map((r) => r.id).sort()).toEqual(["dup-a", "dup-c", "solo"]);
  });
});

describe("textForPart", () => {
  it("does not include passage translation in part slices", () => {
    const labels = ["(1)", "(2)"];
    const part1 = textForPart(sharedModelAnswer, "(1)", labels);
    const part2 = textForPart(sharedModelAnswer, "(2)", labels);

    expect(part1).toBe("First answer");
    expect(part2).toBe("Second answer");
    expect(part1).not.toContain("【全訳】");
    expect(part2).not.toContain("全訳");
  });

  it("strips translation when only one part label exists in text", () => {
    const onlyFirst = `(1) Only labeled part

【全訳】
和訳本文`;
    const slice = textForPart(onlyFirst, "(1)", ["(1)", "(2)"]);
    expect(slice).toBe("Only labeled part");
    expect(slice).not.toContain("和訳");
  });
});

describe("passageTranslationForPrint", () => {
  it("returns translation only for the last part of a question", () => {
    const siblings = [
      row("p1", "q3", 0, true, sharedModelAnswer),
      row("p2", "q3", 1, true, sharedModelAnswer),
    ];

    expect(passageTranslationForPrint(siblings[0], siblings)).toBe("");
    expect(passageTranslationForPrint(siblings[1], siblings)).toBe("これは本文の全訳です。");
  });
});

describe("modelAnswerForPrint", () => {
  it("splits shared model answer without translation per part", () => {
    const siblings = [
      row("p1", "q3", 0, true, sharedModelAnswer),
      row("p2", "q3", 1, true, sharedModelAnswer),
    ];

    expect(modelAnswerForPrint(siblings[0], siblings)).toBe("First answer");
    expect(modelAnswerForPrint(siblings[1], siblings)).toBe("Second answer");
  });
});
