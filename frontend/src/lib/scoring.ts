import type { QuestionResult, Session } from "@/types/firestore";

export const SCORE_SCALE = 100;

export function toScoreOutOf100(totalScore: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.round((totalScore / maxScore) * SCORE_SCALE);
}

export function sumResultScores(results: QuestionResult[]) {
  return results.reduce(
    (acc, r) => ({
      totalScore: acc.totalScore + (r.score ?? 0),
      maxScore: acc.maxScore + (r.maxPoints ?? 0),
    }),
    { totalScore: 0, maxScore: 0 },
  );
}

export function resolveTotalScore100(
  session: Pick<Session, "totalScore" | "maxScore" | "totalScore100">,
): number {
  if (session.totalScore100 != null) return session.totalScore100;
  return toScoreOutOf100(session.totalScore, session.maxScore);
}

export function formatTotalScoreLabel(
  session: Pick<Session, "totalScore" | "maxScore" | "totalScore100">,
): string {
  return `100点満点中 ${resolveTotalScore100(session)}点`;
}

export function formatQuestionScore(r: Pick<QuestionResult, "score" | "maxPoints">): string {
  const score = Math.round(r.score ?? 0);
  const maxPoints = Math.round(r.maxPoints ?? 0);
  return `${score} / ${maxPoints}点`;
}
