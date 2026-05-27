import type { Session } from "@/types/firestore";

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
