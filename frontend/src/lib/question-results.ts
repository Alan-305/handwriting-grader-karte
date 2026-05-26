import type { AnswerPart, Question, QuestionResult } from "@/types/firestore";

/** Firestore は order のみでソートされるため、小問順 partIndex で整列 */
export function sortQuestionResults(results: QuestionResult[]): QuestionResult[] {
  return [...results].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    const ai = a.partIndex ?? 0;
    const bi = b.partIndex ?? 0;
    if (ai !== bi) return ai - bi;
    return (a.partLabel ?? "").localeCompare(b.partLabel ?? "", "ja", { numeric: true });
  });
}

/** backend answer_parts._points_for_part と同じ配分 */
export function pointsForPart(
  q: Pick<Question, "points" | "answerParts">,
  partIndex: number,
): number {
  const parts = q.answerParts ?? [];
  const partCount = parts.length > 0 ? parts.length : 1;
  const part = parts[partIndex];
  if (part?.points != null) return Number(part.points);
  const total = Number(q.points ?? 10);
  return partCount > 1 ? total / partCount : total;
}

/**
 * テスト定義の配点で maxPoints を上書きする。
 * 旧 normalizePartScores による誤割り算（0.09765625 など）も、満点と得点が同率なら復元する。
 */
export function applyExpectedPartPoints(
  results: QuestionResult[],
  questions: Question[],
): QuestionResult[] {
  const qById = new Map(questions.map((q) => [q.id, q]));
  return results.map((r) => {
    const q = qById.get(r.questionId);
    if (!q) return r;

    const expectedMax = pointsForPart(q, r.partIndex ?? 0);
    const prevMax = r.maxPoints ?? 0;
    let score = r.score ?? 0;

    if (prevMax > 0 && expectedMax > prevMax * 1.5) {
      if (
        score > 0 &&
        Math.abs(score - prevMax) < Math.max(prevMax * 0.02, 1e-6)
      ) {
        score = Math.min(score * (expectedMax / prevMax), expectedMax);
      } else if (score > expectedMax) {
        score = expectedMax;
      }
    } else if (score > expectedMax) {
      score = expectedMax;
    }

    if (Math.abs(prevMax - expectedMax) < 0.001 && Math.abs((r.score ?? 0) - score) < 0.001) {
      return r;
    }
    return { ...r, maxPoints: expectedMax, score };
  });
}

/** @deprecated applyExpectedPartPoints を使用（互換のためそのまま返す） */
export function normalizePartScores(results: QuestionResult[]): QuestionResult[] {
  return results;
}

/** 大問まとめの模範解答・解答文から、当該小問ラベルの部分だけを取り出す */
export function textForPart(
  fullText: string | undefined,
  partLabel: string | undefined,
  siblingLabels: string[],
): string {
  const text = (fullText ?? "").trim();
  if (!text || !partLabel) return text;

  const labels = siblingLabels.filter(Boolean);
  if (labels.length <= 1) return text;

  const escaped = partLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelPattern = "\\([0-9０-９]+\\)|（[0-9０-９]+）";
  const re = new RegExp(
    `${escaped}\\s*([\\s\\S]*?)(?=\\s*${labelPattern}|$)`,
    "i",
  );
  const match = text.match(re);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }

  return text;
}

export function studentAnswerForPrint(
  r: QuestionResult,
  siblings: QuestionResult[],
): string {
  const text = r.studentAnswerText ?? "";
  const parts = siblings.filter((s) => s.questionId === r.questionId && s.order === r.order);
  if (parts.length <= 1) return text;

  const same = parts.every((p) => (p.studentAnswerText ?? "") === text);
  if (!same) return text;

  const labels = parts.map((p) => p.partLabel).filter((x): x is string => Boolean(x));
  return textForPart(text, r.partLabel, labels) || text;
}

export function modelAnswerForPrint(
  r: QuestionResult,
  siblings: QuestionResult[],
): string {
  const text = r.modelAnswer ?? "";
  const parts = siblings.filter((s) => s.questionId === r.questionId && s.order === r.order);
  if (parts.length <= 1) return text;

  const same = parts.every((p) => (p.modelAnswer ?? "") === text);
  if (!same) return text;

  const labels = parts.map((p) => p.partLabel).filter((x): x is string => Boolean(x));
  const extracted = textForPart(text, r.partLabel, labels);
  return extracted || text;
}

export function pickQuestionResultPatch(
  d: Partial<QuestionResult> & { id: string },
): { id: string } & Partial<QuestionResult> {
  const {
    id,
    studentAnswerText,
    explanation,
    modelAnswer,
    grade,
    score,
    feedback,
    contentEvaluation,
    grammarEvaluation,
    polishedAnswer,
    teacherReviewed,
    transcriptionStatus,
    errorTags,
    teacherNotes,
    maxPoints,
  } = d;
  return {
    id,
    ...(studentAnswerText !== undefined ? { studentAnswerText } : {}),
    ...(explanation !== undefined ? { explanation } : {}),
    ...(modelAnswer !== undefined ? { modelAnswer } : {}),
    ...(grade !== undefined ? { grade } : {}),
    ...(score !== undefined ? { score } : {}),
    ...(maxPoints !== undefined ? { maxPoints } : {}),
    ...(feedback !== undefined ? { feedback } : {}),
    ...(contentEvaluation !== undefined ? { contentEvaluation } : {}),
    ...(grammarEvaluation !== undefined ? { grammarEvaluation } : {}),
    ...(polishedAnswer !== undefined ? { polishedAnswer } : {}),
    ...(teacherReviewed !== undefined ? { teacherReviewed } : {}),
    ...(transcriptionStatus !== undefined ? { transcriptionStatus } : {}),
    ...(errorTags !== undefined ? { errorTags } : {}),
    ...(teacherNotes !== undefined ? { teacherNotes } : {}),
  };
}
