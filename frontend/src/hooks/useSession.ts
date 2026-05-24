import { useCallback, useEffect, useState } from "react";
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { PrintArtifact, QuestionResult, Session } from "@/types/firestore";
import { sumResultScores, toScoreOutOf100 } from "@/lib/scoring";
import { useAuth } from "./useAuth";

export function useSession(sessionId: string | undefined) {
  const [session, setSession] = useState<Session | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
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
        setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as QuestionResult));
      },
    );
    return () => {
      unsubSession();
      unsubResults();
    };
  }, [sessionId]);

  return { session, results, loading };
}

export function useUpdateQuestionResults(sessionId: string | undefined) {
  const saveResults = useCallback(
    async (drafts: Array<{ id: string } & Partial<QuestionResult>>) => {
      if (!sessionId) return;
      await Promise.all(
        drafts.map(({ id, ...data }) =>
          updateDoc(doc(getDb(), "sessions", sessionId, "question_results", id), data),
        ),
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
    async (results: Pick<QuestionResult, "score" | "maxPoints">[]) => {
      if (!sessionId) return;
      const { totalScore, maxScore } = sumResultScores(results);
      const totalScore100 = toScoreOutOf100(totalScore, maxScore);
      await updateDoc(doc(getDb(), "sessions", sessionId), {
        totalScore,
        maxScore,
        totalScore100,
      });
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

export function useSessionsForStudent(studentId: string | undefined) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    if (!user || !studentId) return;
    const q = query(
      collection(getDb(), "sessions"),
      orderBy("sessionDate", "desc"),
    );
    return onSnapshot(q, (snap) => {
      const all = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Session)
        .filter((s) => s.teacherId === user.uid && s.studentId === studentId);
      setSessions(all);
    });
  }, [user, studentId]);

  return sessions;
}
