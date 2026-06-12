import { describe, expect, it } from "vitest";
import {
  previewAnchorFallbacks,
  previewAnchorId,
  questionPromptAnchor,
  questionUnitAnchor,
} from "@/lib/preview-anchor";

describe("previewAnchorId", () => {
  it("maps editor anchor to preview DOM id", () => {
    const anchor = questionUnitAnchor("abc123", "abc123-0");
    expect(previewAnchorId(anchor)).toBe("preview-q-abc123--unit-abc123-0");
    expect(previewAnchorId(questionPromptAnchor("abc123"))).toBe(
      "preview-q-abc123--prompt",
    );
  });
});

describe("previewAnchorFallbacks", () => {
  it("falls back from unit anchor to question anchor", () => {
    expect(previewAnchorFallbacks("q:q1:unit:q1-0")).toEqual([
      "q:q1:unit:q1-0",
      "q:q1",
    ]);
  });
});
