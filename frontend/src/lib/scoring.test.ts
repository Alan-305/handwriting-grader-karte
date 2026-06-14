import { describe, expect, it } from "vitest";
import { formatQuestionScore, toScoreOutOf100 } from "./scoring";

describe("formatQuestionScore", () => {
  it("rounds fractional scores for display", () => {
    expect(formatQuestionScore({ score: 8.3333333, maxPoints: 15 })).toBe("8 / 15点");
    expect(formatQuestionScore({ score: 68.66666666666667, maxPoints: 99.99999999999999 })).toBe(
      "69 / 100点",
    );
  });
});

describe("toScoreOutOf100", () => {
  it("returns a whole number", () => {
    expect(toScoreOutOf100(68.66666666666667, 99.99999999999999)).toBe(69);
  });
});
