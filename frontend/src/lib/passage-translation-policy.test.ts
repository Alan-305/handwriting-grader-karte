import { describe, expect, it } from "vitest";
import {
  isExcludedFromPassageTranslation,
  supportsPassageTranslation,
} from "@/lib/passage-translation-policy";
import type { Question } from "@/types/firestore";

function englishQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    order: 1,
    type: "english",
    prompt: `次の英文を読みなさい。\n\n${"word ".repeat(60)}`,
    modelAnswer: "",
    points: 10,
    cropRegion: { x: 0, y: 0, width: 0, height: 0 },
    ...overrides,
  };
}

describe("passage-translation-policy", () => {
  it("excludes Q2A/Q2B pipelines", () => {
    expect(
      isExcludedFromPassageTranslation({ generationPipeline: "q2a", majorOrder: 2 }),
    ).toBe(true);
    expect(
      isExcludedFromPassageTranslation({ generationPipeline: "q2b", majorOrder: 2 }),
    ).toBe(true);
  });

  it("excludes major order 3", () => {
    expect(isExcludedFromPassageTranslation({ order: 3 })).toBe(true);
  });

  it("supports Q5 english passage", () => {
    expect(
      supportsPassageTranslation({
        majorOrder: 5,
        generationPipeline: "q5",
        type: "english",
        prompt: englishQuestion().prompt,
        modelAnswer: "",
        points: 20,
      }),
    ).toBe(true);
  });

  it("does not support Q3 even with english passage", () => {
    expect(supportsPassageTranslation(englishQuestion({ order: 3 }))).toBe(false);
  });
});
