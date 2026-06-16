import { describe, expect, it } from "vitest";
import {
  clampFontScale,
  clampLineHeight,
  DEFAULT_PRINT_LAYOUT_SETTINGS,
  shouldApplyQuestionGap,
  shouldBreakBeforeQuestion,
  toggleBreakBeforeOrder,
} from "./print-layout-settings";

describe("shouldBreakBeforeQuestion", () => {
  it("returns false for the first group", () => {
    expect(shouldBreakBeforeQuestion(0, 1, DEFAULT_PRINT_LAYOUT_SETTINGS)).toBe(false);
  });

  it("breaks before question 2 in split_first mode", () => {
    expect(
      shouldBreakBeforeQuestion(1, 2, { sectionMode: "split_first", breakBeforeOrders: [] }),
    ).toBe(true);
    expect(
      shouldBreakBeforeQuestion(2, 3, { sectionMode: "split_first", breakBeforeOrders: [] }),
    ).toBe(false);
  });

  it("breaks before each major question group in one_per_question mode", () => {
    const settings = { sectionMode: "one_per_question" as const, breakBeforeOrders: [] };
    expect(shouldBreakBeforeQuestion(0, 1, settings)).toBe(false);
    expect(shouldBreakBeforeQuestion(1, 2, settings)).toBe(true);
    expect(shouldBreakBeforeQuestion(2, 3, settings)).toBe(true);
  });

  it("respects custom breakBeforeOrders", () => {
    const settings = { sectionMode: "custom" as const, breakBeforeOrders: [3] };
    expect(shouldBreakBeforeQuestion(1, 2, settings)).toBe(false);
    expect(shouldBreakBeforeQuestion(2, 3, settings)).toBe(true);
  });
});

describe("toggleBreakBeforeOrder", () => {
  it("adds and removes break positions", () => {
    let next = toggleBreakBeforeOrder(
      { ...DEFAULT_PRINT_LAYOUT_SETTINGS, sectionMode: "custom" },
      2,
      true,
    );
    expect(next.breakBeforeOrders).toEqual([2]);
    next = toggleBreakBeforeOrder(next, 3, true);
    expect(next.breakBeforeOrders).toEqual([2, 3]);
    next = toggleBreakBeforeOrder(next, 2, false);
    expect(next.breakBeforeOrders).toEqual([3]);
  });
});

describe("shouldApplyQuestionGap", () => {
  it("applies gap from question 3 onward in split_first", () => {
    expect(shouldApplyQuestionGap(1, { sectionMode: "split_first", breakBeforeOrders: [] })).toBe(
      false,
    );
    expect(shouldApplyQuestionGap(2, { sectionMode: "split_first", breakBeforeOrders: [] })).toBe(
      true,
    );
  });
});

describe("clampFontScale", () => {
  it("clamps to 85–120", () => {
    expect(clampFontScale(80)).toBe(85);
    expect(clampFontScale(125)).toBe(120);
    expect(clampFontScale(100)).toBe(100);
  });
});

describe("clampLineHeight", () => {
  it("clamps to 1.25–1.9", () => {
    expect(clampLineHeight(1)).toBe(1.25);
    expect(clampLineHeight(2)).toBe(1.9);
    expect(clampLineHeight(1.55)).toBe(1.55);
  });
});
