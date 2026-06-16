import { describe, expect, it } from "vitest";
import type { Session } from "@/types/firestore";
import { listSessionsForStudentHistory } from "@/lib/session-list";
import {
  isInProgressSession,
  sessionResumeActionLabel,
  sessionResumePath,
} from "@/lib/session-resume";

function session(partial: Partial<Session> & Pick<Session, "id" | "status">): Session {
  return {
    teacherId: "t1",
    studentId: "s1",
    testId: "test1",
    sessionDate: { toMillis: () => 1000 } as Session["sessionDate"],
    sourceImagePath: "path",
    totalScore: 0,
    maxScore: 100,
    ...partial,
  } as Session;
}

describe("session-resume", () => {
  it("routes in-progress sessions to the correct step", () => {
    expect(sessionResumePath(session({ id: "a", status: "crop_review" }))).toBe(
      "/sessions/a/crop-review",
    );
    expect(sessionResumePath(session({ id: "b", status: "transcription_review" }))).toBe(
      "/sessions/b/transcription",
    );
    expect(sessionResumePath(session({ id: "c", status: "review" }))).toBe(
      "/sessions/c/grading-review",
    );
  });

  it("labels resume action for in-progress vs completed", () => {
    expect(sessionResumeActionLabel(session({ id: "a", status: "review" }))).toBe("作業を再開");
    expect(sessionResumeActionLabel(session({ id: "b", status: "completed" }))).toBe(
      "添削結果・解説を見る",
    );
  });

  it("detects in-progress sessions", () => {
    expect(isInProgressSession(session({ id: "a", status: "review" }))).toBe(true);
    expect(isInProgressSession(session({ id: "b", status: "completed" }))).toBe(false);
  });
});

describe("listSessionsForStudentHistory", () => {
  it("includes in-progress sessions and deduped completed ones", () => {
    const rows = [
      session({ id: "wip", status: "transcription_review", testId: "t1" }),
      session({ id: "done1", status: "completed", testId: "t1" }),
      session({ id: "done2", status: "completed", testId: "t2" }),
    ];
    const { inProgress, completed } = listSessionsForStudentHistory(rows);
    expect(inProgress.map((s) => s.id)).toEqual(["wip"]);
    expect(completed.map((s) => s.id)).toEqual(["done1", "done2"]);
  });
});
