import { describe, expect, it } from "vitest";
import { splitModelAnswerSections } from "./model-answer-sections";

describe("splitModelAnswerSections", () => {
  it("splits translation block", () => {
    const parsed = splitModelAnswerSections("問1 B\n解説です。\n\n【全訳】\n和訳文");
    expect(parsed.body).toContain("問1 B");
    expect(parsed.translation).toContain("【全訳】");
    expect(parsed.translation).toContain("和訳文");
  });

  it("extracts vocabulary section", () => {
    const parsed = splitModelAnswerSections("解答\n\n【重要語句】\n- word\n\n【全訳】\n訳");
    expect(parsed.body).toBe("解答");
    expect(parsed.vocabulary).toContain("word");
    expect(parsed.translation).toContain("訳");
  });
});
