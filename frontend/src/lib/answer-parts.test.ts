import { describe, expect, it } from "vitest";
import {
  partLabel,
  relabelAnswerParts,
  resolvePartLabelScheme,
} from "./answer-parts";
import type { Question } from "@/types/firestore";

describe("partLabel scheme", () => {
  it("generates numeric labels", () => {
    expect(partLabel(1, "numeric")).toBe("(1)");
    expect(partLabel(2, "numeric")).toBe("(2)");
  });

  it("generates alpha labels", () => {
    expect(partLabel(1, "alpha")).toBe("(A)");
    expect(partLabel(2, "alpha")).toBe("(B)");
    expect(partLabel(3, "alpha")).toBe("(C)");
  });

  it("infers alpha from existing labels", () => {
    const q = {
      answerParts: [{ label: "(A)" }, { label: "(B)" }],
    } as Question;
    expect(resolvePartLabelScheme(q)).toBe("alpha");
  });

  it("relabels parts when scheme changes", () => {
    const parts = relabelAnswerParts(
      [
        { label: "(1)", answerFormat: "short", cropRegion: { x: 0, y: 0, width: 1, height: 1 } },
        { label: "(2)", answerFormat: "short", cropRegion: { x: 0, y: 0, width: 1, height: 1 } },
      ],
      "alpha",
    );
    expect(parts[0]?.label).toBe("(A)");
    expect(parts[1]?.label).toBe("(B)");
  });
});
