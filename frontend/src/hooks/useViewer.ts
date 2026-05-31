import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { sortQuestionResults } from "@/lib/question-results";
import { dedupeSessionsByTest } from "@/lib/session-list";
import type {
  AggregatedStats,
  KarteSnapshot,
  QuestionResult,
  Session,
  Student,
} from "@/types/firestore";
import { useAuth } from "./useAuth";

/** ログイン中の閲覧者メール（小文字。Firestore 保存値とそろえる） */
export function useViewerEmail(): string | null {
  const { user } = useAuth();
  return useMemo(() => user?.email?.trim().toLowerCase() ?? null, [user]);
}

/** 自分（このメール）に共有されている生徒の一覧 */
export function useViewerStudents() {
  const email = useViewerEmail();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) {
      setStudents([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(getDb(), "students"),
      where("viewerEmails", "array-contains", email),
    );
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Student);
        rows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
        setStudents(rows);
        setLoading(false);
      },
      (err) => {
        console.error("閲覧者の生徒一覧取得に失敗しました", err);
        setStudents([]);
        setLoading(false);
      },
    );
  }, [email]);

  return { students, loading };
}

/** 生徒1人分のカルテデータ（生徒・統計・最新スナップショット）。閲覧者・読み取り専用 */
export function useViewerKarte(studentId: string | undefined) {
  const [student, setStudent] = useState<Student | null>(null);
  const [stats, setStats] = useState<AggregatedStats | null>(null);
  const [snapshot, setSnapshot] = useState<KarteSnapshot | null>(null);

  useEffect(() => {
    if (!studentId) return;
    return onSnapshot(doc(getDb(), "students", studentId), (snap) => {
      if (snap.exists()) setStudent({ id: snap.id, ...snap.data() } as Student);
    });
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    return onSnapshot(doc(getDb(), "students", studentId, "stats", "aggregated"), (snap) => {
      if (snap.exists()) setStats(snap.data() as AggregatedStats);
    });
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    const q = query(
      collection(getDb(), "students", studentId, "karte_snapshots"),
      orderBy("generatedAt", "desc"),
      limit(1),
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setSnapshot({ id: d.id, ...d.data() } as KarteSnapshot);
      }
    });
  }, [studentId]);

  return { student, stats, snapshot };
}

/** 生徒の完了済みセッション（成果物）一覧。teacherId で絞らず studentId のみで取得 */
export function useViewerSessions(studentId: string | undefined) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    const q = query(collection(getDb(), "sessions"), where("studentId", "==", studentId));
    return onSnapshot(
      q,
      (snap) => {
        setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session));
        setLoading(false);
      },
      (err) => {
        console.error("閲覧者のセッション取得に失敗しました", err);
        setSessions([]);
        setLoading(false);
      },
    );
  }, [studentId]);

  const completed = useMemo(() => dedupeSessionsByTest(sessions), [sessions]);

  return { sessions: completed, loading };
}

/**
 * 1セッション分の添削結果（閲覧者・読み取り専用）。
 * tests/questions は教師専用ルールのため読まず、session と question_results のみ取得する。
 */
export function useViewerSession(sessionId: string | undefined) {
  const [session, setSession] = useState<Session | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    const unsubSession = onSnapshot(
      doc(getDb(), "sessions", sessionId),
      (snap) => {
        if (snap.exists()) setSession({ id: snap.id, ...snap.data() } as Session);
        setLoading(false);
      },
      (err) => {
        console.error("閲覧者のセッション取得に失敗しました", err);
        setLoading(false);
      },
    );
    const unsubResults = onSnapshot(
      query(
        collection(getDb(), "sessions", sessionId, "question_results"),
        orderBy("order"),
      ),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as QuestionResult);
        setResults(sortQuestionResults(rows));
      },
      (err) => {
        console.error("閲覧者の添削結果取得に失敗しました", err);
      },
    );
    return () => {
      unsubSession();
      unsubResults();
    };
  }, [sessionId]);

  return { session, results, loading };
}
