import { describe, expect, it } from "vitest";
import {
  isAiPassageTranslationRecommended,
  shouldShowPassageTranslationSection,
} from "@/lib/passage-translation-policy";
import type { Question } from "@/types/firestore";

const LONG_EN = `次の英文を読みなさい。\n\n${"word ".repeat(60)}`;

function englishQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    order: 1,
    type: "english",
    prompt: LONG_EN,
    modelAnswer: "",
    points: 10,
    cropRegion: { x: 0, y: 0, width: 0, height: 0 },
    ...overrides,
  };
}

describe("passage-translation-policy", () => {
  it("recommends Q5 content at set order 3", () => {
    expect(
      isAiPassageTranslationRecommended({
        generationPipeline: "q5",
        type: "english",
        prompt: LONG_EN,
      }),
    ).toBe(true);
  });

  it("recommends Q4A content at set order 1", () => {
    expect(
      isAiPassageTranslationRecommended({
        generationPipeline: "q4a",
        type: "english",
        prompt: LONG_EN,
      }),
    ).toBe(true);
  });

  it("excludes q2b pipeline regardless of order", () => {
    expect(
      isAiPassageTranslationRecommended({
        generationPipeline: "q2b",
        type: "english",
        prompt: LONG_EN,
      }),
    ).toBe(false);
  });

  it("does not use set order alone to exclude summary reading", () => {
    expect(
      isAiPassageTranslationRecommended(
        englishQuestion({
          order: 3,
          generationPipeline: undefined,
          prompt: `次の英文を読み、80字以内で要約せよ。\n\n${"word ".repeat(60)}`,
        }),
      ),
    ).toBe(true);
  });

  it("shows section when translation already exists", () => {
    expect(
      shouldShowPassageTranslationSection(
        englishQuestion({ generationPipeline: "q2a" }),
        "既存の全訳",
      ),
    ).toBe(true);
  });
});
