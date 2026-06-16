import type { Session } from "@/types/firestore";
import { filterInProgressSessions } from "@/lib/session-resume";

function sessionActivityMs(s: Session): number {
  const pick =
    s.gradingConfirmedAt?.toMillis?.() ??
    s.completedAt?.toMillis?.() ??
    s.sessionDate?.toMillis?.() ??
    0;
  return pick;
}

/** 同一 testId は最新の完了セッション1件だけ（再添削=上書き） */
export function dedupeSessionsByTest(sessions: Session[]): Session[] {
  const firstSeen = new Map<string, number>();
  for (const s of sessions) {
    const tid = s.testId || s.id;
    const ms = s.sessionDate?.toMillis?.() ?? 0;
    const prev = firstSeen.get(tid);
    if (prev === undefined || ms < prev) firstSeen.set(tid, ms);
  }

  const latestByTest = new Map<string, Session>();
  for (const s of sessions) {
    if (s.status !== "completed") continue;
    const tid = s.testId || s.id;
    const cur = latestByTest.get(tid);
    if (!cur || sessionActivityMs(s) >= sessionActivityMs(cur)) {
      latestByTest.set(tid, s);
    }
  }

  return [...latestByTest.values()].sort((a, b) => {
    const ta = firstSeen.get(a.testId || a.id) ?? sessionActivityMs(a);
    const tb = firstSeen.get(b.testId || b.id) ?? sessionActivityMs(b);
    return ta - tb;
  });
}

/** 生徒履歴: 作業中セッション（すべて）＋完了済み（テストごとに最新1件） */
export function listSessionsForStudentHistory(sessions: Session[]): {
  inProgress: Session[];
  completed: Session[];
} {
  const inProgress = filterInProgressSessions(sessions);
  const completed = dedupeSessionsByTest(sessions);
  const inProgressIds = new Set(inProgress.map((s) => s.id));
  return {
    inProgress,
    completed: completed.filter((s) => !inProgressIds.has(s.id)),
  };
}
