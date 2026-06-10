import { describe, expect, it } from "vitest";
import {
  answerBodyWithoutPassageTranslation,
  mergeModelAnswerSections,
  questionHasEnglishPassage,
  splitModelAnswerSections,
} from "./model-answer-sections";
import type { Question } from "@/types/firestore";

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

  it("merges answer body and passage translation", () => {
    const merged = mergeModelAnswerSections("解答です", "和訳です");
    expect(merged).toContain("【全訳】");
    expect(merged).toContain("和訳です");
  });

  it("strips passage translation for answer-only edit", () => {
    const body = answerBodyWithoutPassageTranslation("解答\n\n【全訳】\n和訳");
    expect(body).toBe("解答");
    expect(body).not.toContain("全訳");
  });

  it("detects english passage in prompt", () => {
    const q = {
      type: "english",
      prompt: "次の英文を読みなさい。\n\n" + "word ".repeat(50),
    } as Question;
    expect(questionHasEnglishPassage(q)).toBe(true);
  });
});
