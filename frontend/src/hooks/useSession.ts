import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { omitUndefined } from "@/lib/firestore-write";
import {
  applyExpectedPartPoints,
  pickQuestionResultPatch,
  sortQuestionResults,
} from "@/lib/question-results";
import { sumResultScores, toScoreOutOf100 } from "@/lib/scoring";
import type { PrintArtifact, Question, QuestionResult, Session, StudentInterviewRecord } from "@/types/firestore";
import { useAuth } from "./useAuth";

export function useSession(sessionId: string | undefined) {
  const [session, setSession] = useState<Session | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    const unsubSession = onSnapshot(doc(getDb(), "sessions", sessionId), (snap) => {
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() } as Session);
      setLoading(false);
    });
    const unsubResults = onSnapshot(
      query(collection(getDb(), "sessions", sessionId, "question_results"), orderBy("order")),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as QuestionResult);
        setResults(sortQuestionResults(rows));
      },
    );
    return () => {
      unsubSession();
      unsubResults();
    };
  }, [sessionId]);

  const testId = session?.testId;

  useEffect(() => {
    if (!testId) {
      setQuestions([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(getDb(), "tests", testId, "questions"), orderBy("order")),
      (snap) => {
        setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Question));
      },
    );
    return () => unsub();
  }, [testId]);

  const displayResults = useMemo(() => {
    const sorted = sortQuestionResults(results);
    if (!questions.length) return sorted;
    return applyExpectedPartPoints(sorted, questions);
  }, [results, questions]);

  return { session, results: displayResults, rawResults: results, questions, loading };
}

export function useUpdateQuestionResults(sessionId: string | undefined) {
  const saveResults = useCallback(
    async (drafts: Array<{ id: string } & Partial<QuestionResult>>) => {
      if (!sessionId) return;
      await Promise.all(
        drafts.map((draft) => {
          const { id, ...data } = pickQuestionResultPatch(draft);
          return updateDoc(
            doc(getDb(), "sessions", sessionId, "question_results", id),
            omitUndefined(data),
          );
        }),
      );
    },
    [sessionId],
  );

  const setPrintFinalized = useCallback(
    async (finalized: boolean) => {
      if (!sessionId) return;
      await updateDoc(doc(getDb(), "sessions", sessionId), {
        studentPrintFinalizedAt: finalized ? serverTimestamp() : deleteField(),
      });
    },
    [sessionId],
  );

  const syncSessionScores = useCallback(
    async (results: QuestionResult[]) => {
      if (!sessionId) return;
      const { totalScore, maxScore } = sumResultScores(results);
      const totalScore100 = toScoreOutOf100(totalScore, maxScore);
      await updateDoc(
        doc(getDb(), "sessions", sessionId),
        omitUndefined({
          totalScore,
          maxScore,
          totalScore100,
        }),
      );
    },
    [sessionId],
  );

  return { saveResults, setPrintFinalized, syncSessionScores };
}

export function useSavePrintArtifact(sessionId: string) {
  const saveArtifact = useCallback(
    async (type: "student" | "teacher", content: PrintArtifact["content"]) => {
      const ref = doc(collection(getDb(), "sessions", sessionId, "print_artifacts"));
      await setDoc(ref, {
        type,
        content,
        generatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    [sessionId],
  );
  return { saveArtifact };
}

/** 新しい日付が先頭（一覧・モーダル用） */
function sortSessionsByDateDesc(rows: Session[]): Session[] {
  return [...rows].sort((a, b) => {
    const ta = a.sessionDate?.toMillis?.() ?? 0;
    const tb = b.sessionDate?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

/**
 * 生徒に紐づくセッション一覧。
 * Firestore は orderBy("sessionDate") があると sessionDate 欠損ドキュメントを結果から除外するため、
 * orderBy は使わずクライアントで並べ替える（複合 index: teacherId + studentId で十分）。
 */
export function useSessionsForStudent(studentId: string | undefined) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    if (!user || !studentId) {
      setSessions([]);
      return;
    }

    const q = query(
      collection(getDb(), "sessions"),
      where("teacherId", "==", user.uid),
      where("studentId", "==", studentId),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setSessions(
          sortSessionsByDateDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session)),
        );
      },
      (err) => {
        console.error("sessions query for student failed", err);
        setSessions([]);
      },
    );

    return () => unsub();
  }, [user, studentId]);

  return sessions;
}

/** 生徒の面談記録（面談画面と共通） */
export function useInterviewRecords(studentId: string | undefined) {
  const [records, setRecords] = useState<StudentInterviewRecord[]>([]);

  useEffect(() => {
    if (!studentId) return;
    const q = query(
      collection(getDb(), "students", studentId, "interview_records"),
      orderBy("conductedAt", "desc"),
    );
    return onSnapshot(q, (snap) => {
      setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StudentInterviewRecord));
    });
  }, [studentId]);

  return records;
}
