import { describe, expect, it } from "vitest";
import {
  isAcceptedAnswerSheetFile,
  isAnswerSheetPdfFile,
  mergeAnswerSheetFiles,
} from "./answer-sheet-upload";

function fakeFile(name: string, type: string): File {
  return new File(["content"], name, { type });
}

describe("isAnswerSheetPdfFile", () => {
  it("accepts standard PDF mime type", () => {
    expect(isAnswerSheetPdfFile(fakeFile("scan.pdf", "application/pdf"))).toBe(true);
  });

  it("accepts PDF by extension when mime is empty (common on drag-and-drop)", () => {
    expect(isAnswerSheetPdfFile(fakeFile("answers.pdf", ""))).toBe(true);
  });

  it("accepts PDF by extension when mime is application/octet-stream", () => {
    expect(isAnswerSheetPdfFile(fakeFile("answers.pdf", "application/octet-stream"))).toBe(true);
  });

  it("accepts alternate PDF mime types", () => {
    expect(isAnswerSheetPdfFile(fakeFile("scan.PDF", "application/x-pdf"))).toBe(true);
  });

  it("rejects non-PDF files", () => {
    expect(isAcceptedAnswerSheetFile(fakeFile("notes.txt", "text/plain"))).toBe(false);
  });
});

describe("mergeAnswerSheetFiles", () => {
  it("keeps PDF uploads even when not classified as images", () => {
    const pdf = fakeFile("sheet.pdf", "application/octet-stream");
    const merged = mergeAnswerSheetFiles([], [pdf]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe("sheet.pdf");
  });
});
