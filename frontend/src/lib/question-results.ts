import type { AnswerPart, Question, QuestionResult } from "@/types/firestore";
import {
  answerBodyWithoutPassageTranslation,
  mergeModelAnswerSections,
  splitModelAnswerSections,
  translationBody,
} from "@/lib/model-answer-sections";

function resultRank(r: QuestionResult): number {
  const graded = r.graded ? 1 : 0;
  const updated = r.updatedAt?.toMillis?.() ?? r.createdAt?.toMillis?.() ?? 0;
  return graded * 1_000_000_000_000 + updated;
}

/** 同一 (questionId, partIndex) の重複を1件にまとめる（表示・採点の整合用） */
export function dedupeQuestionResults(results: QuestionResult[]): QuestionResult[] {
  const groups = new Map<string, QuestionResult[]>();
  for (const r of results) {
    const key = `${r.questionId}:${r.partIndex ?? 0}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.values()].map((rows) =>
    rows.reduce((best, row) => (resultRank(row) > resultRank(best) ? row : best)),
  );
}

/** Firestore は order のみでソートされるため、小問順 partIndex で整列 */
export function sortQuestionResults(results: QuestionResult[]): QuestionResult[] {
  return dedupeQuestionResults(results).sort((a, b) => {
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

  const bodyText = answerBodyWithoutPassageTranslation(text);

  const labels = siblingLabels.filter(Boolean);
  if (labels.length <= 1) return bodyText;

  const escaped = partLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelPattern = "\\([0-9０-９]+\\)|（[0-9０-９]+）";
  const re = new RegExp(
    `${escaped}\\s*([\\s\\S]*?)(?=\\s*${labelPattern}|$)`,
    "i",
  );
  const match = bodyText.match(re);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }

  return bodyText;
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

/** 自由英作文（内容・文法・完成版のいずれかがある） */
export function isCompositionResult(
  r: Pick<QuestionResult, "contentEvaluation" | "grammarEvaluation" | "polishedAnswer">,
): boolean {
  return Boolean(r.contentEvaluation || r.grammarEvaluation || r.polishedAnswer);
}

/** 長文総合読解の小問（複数 answerParts または composite 大問） */
export function isComprehensiveReadingResult(
  r: Pick<
    QuestionResult,
    "contentEvaluation" | "grammarEvaluation" | "polishedAnswer" | "partCount" | "questionAnswerFormat" | "questionId" | "order"
  >,
  siblings: QuestionResult[] = [],
): boolean {
  if (isCompositionResult(r)) return false;
  if ((r.partCount ?? 0) > 1) return true;
  if (r.questionAnswerFormat === "composite") return true;
  const parts = siblings.filter((s) => s.questionId === r.questionId && s.order === r.order);
  return parts.length > 1;
}

/** 記号・正誤問題は解説内で正答も完結させるため、模範解答パネルは出さない */
export function shouldShowModelAnswerPanel(
  r: Pick<QuestionResult, "type" | "polishedAnswer" | "answerFormat" | "transcriptionProfile" | "partCount" | "questionAnswerFormat" | "questionId" | "order">,
  siblings: QuestionResult[] = [],
): boolean {
  if (r.polishedAnswer) return false;
  if (isComprehensiveReadingResult(r, siblings)) return true;
  if (r.type === "symbol") return false;
  if (r.answerFormat === "short") return false;
  if (r.transcriptionProfile === "symbol") return false;
  return true;
}

/** 同一設問内の最後の小問か */
export function isLastQuestionPart(
  r: Pick<QuestionResult, "id" | "questionId" | "order" | "partIndex">,
  siblings: QuestionResult[] = [],
): boolean {
  const group = siblings.filter((s) => s.questionId === r.questionId && s.order === r.order);
  if (group.length <= 1) return true;
  const sorted = [...group].sort((a, b) => (a.partIndex ?? 0) - (b.partIndex ?? 0));
  return sorted[sorted.length - 1]?.id === r.id;
}

/** modelAnswer に本文全訳を結合（既存の【全訳】は置き換え） */
export function modelAnswerWithPassageTranslation(
  modelAnswer: string,
  translation: string,
): string {
  return mergeModelAnswerSections(answerBodyWithoutPassageTranslation(modelAnswer), translation);
}

/** 同一設問の全小問 modelAnswer を揃えつつ、全訳だけ更新する */
export function updateQuestionPassageTranslation(
  drafts: QuestionResult[],
  targetId: string,
  translation: string,
): QuestionResult[] {
  const target = drafts.find((d) => d.id === targetId);
  if (!target) return drafts;

  const group = drafts.filter((s) => s.questionId === target.questionId && s.order === target.order);
  if (group.length === 0) return drafts;

  const labels = group.map((p) => p.partLabel).filter((x): x is string => Boolean(x));
  const sorted = [...group].sort((a, b) => (a.partIndex ?? 0) - (b.partIndex ?? 0));

  let fullBody = "";
  if (sorted.length > 1 && labels.length > 1) {
    fullBody = sorted
      .map((p) => {
        const slice = modelAnswerForPrint(p, drafts);
        return p.partLabel ? `${p.partLabel} ${slice}` : slice;
      })
      .join("\n");
  } else {
    fullBody = answerBodyWithoutPassageTranslation(sorted[0]?.modelAnswer ?? "");
  }

  const merged = mergeModelAnswerSections(fullBody, translation);
  const groupIds = new Set(group.map((g) => g.id));
  return drafts.map((d) => (groupIds.has(d.id) ? { ...d, modelAnswer: merged } : d));
}

/** 本文全訳（最後の小問でのみ表示） */
export function passageTranslationForPrint(
  r: Pick<QuestionResult, "id" | "questionId" | "order" | "partIndex" | "modelAnswer">,
  siblings: QuestionResult[] = [],
): string {
  if (!isLastQuestionPart(r, siblings)) return "";

  const group = siblings.filter((s) => s.questionId === r.questionId && s.order === r.order);
  const sources = group.length > 0 ? group.map((p) => p.modelAnswer ?? "") : [r.modelAnswer ?? ""];
  for (const raw of sources) {
    const { translation } = splitModelAnswerSections(raw);
    if (translation.trim()) return translationBody(translation);
  }
  return "";
}

export function modelAnswerForPrint(
  r: QuestionResult,
  siblings: QuestionResult[],
): string {
  const text = r.modelAnswer ?? "";
  const bodyOnly = answerBodyWithoutPassageTranslation(text);
  const parts = siblings.filter((s) => s.questionId === r.questionId && s.order === r.order);
  if (parts.length <= 1) return bodyOnly;

  const same = parts.every((p) => (p.modelAnswer ?? "") === text);
  if (!same) return answerBodyWithoutPassageTranslation(text);

  const labels = parts.map((p) => p.partLabel).filter((x): x is string => Boolean(x));
  const extracted = textForPart(text, r.partLabel, labels);
  return extracted || bodyOnly;
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
