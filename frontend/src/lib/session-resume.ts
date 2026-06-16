import type { Session, SessionStatus } from "@/types/firestore";

const IN_PROGRESS_STATUSES: SessionStatus[] = [
  "uploaded",
  "aligning",
  "aligned",
  "crop_review",
  "transcribing",
  "transcription_review",
  "grading",
  "review",
];

export function isInProgressSession(session: Pick<Session, "status">): boolean {
  return session.status !== "completed";
}

export function sessionResumePath(session: Pick<Session, "id" | "status">): string {
  switch (session.status) {
    case "uploaded":
    case "aligning":
    case "aligned":
    case "crop_review":
      return `/sessions/${session.id}/crop-review`;
    case "transcribing":
    case "transcription_review":
      return `/sessions/${session.id}/transcription`;
    case "grading":
    case "review":
      return `/sessions/${session.id}/grading-review`;
    case "completed":
    default:
      return `/sessions/${session.id}`;
  }
}

export function sessionResumeActionLabel(session: Pick<Session, "status">): string {
  if (session.status === "completed") return "添削結果・解説を見る";
  return "作業を再開";
}

export function sessionWorkflowLabel(status: SessionStatus): string {
  const labels: Partial<Record<SessionStatus, string>> = {
    uploaded: "アップロード済",
    aligning: "位置合わせ中",
    aligned: "位置合わせ済",
    crop_review: "切り出し確認中",
    transcribing: "読み取り中",
    transcription_review: "転記確認中",
    grading: "添削中",
    review: "添削確認待ち",
    completed: "完了",
  };
  return labels[status] ?? status;
}

export function sortSessionsByRecency(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const ta =
      a.draftSavedAt?.toMillis?.() ??
      a.sessionDate?.toMillis?.() ??
      0;
    const tb =
      b.draftSavedAt?.toMillis?.() ??
      b.sessionDate?.toMillis?.() ??
      0;
    return tb - ta;
  });
}

export function filterInProgressSessions(sessions: Session[]): Session[] {
  return sortSessionsByRecency(sessions.filter(isInProgressSession));
}

export { IN_PROGRESS_STATUSES };
