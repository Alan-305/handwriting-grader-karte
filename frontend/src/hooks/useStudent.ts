import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import type { Student, TargetUniversityRef } from "@/types/firestore";
import { useAuth } from "./useAuth";

export function useStudents() {
  const { user, loading: authLoading } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setStudents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(getDb(), "students"),
      where("teacherId", "==", user.uid),
      orderBy("name"),
    );
    return onSnapshot(
      q,
      (snap) => {
        setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Student));
        setLoading(false);
      },
      (error) => {
        console.error("生徒一覧の読み込みに失敗しました:", error);
        setLoading(false);
      },
    );
  }, [user, authLoading]);

  const createStudent = useCallback(
    async (data: { name: string; course: string; targetUniversities: TargetUniversityRef[]; memo?: string }) => {
      if (!user) return;
      await addDoc(collection(getDb(), "students"), {
        teacherId: user.uid,
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    },
    [user],
  );

  const updateStudent = useCallback(async (id: string, data: Partial<Student>) => {
    await updateDoc(doc(getDb(), "students", id), { ...data, updatedAt: serverTimestamp() });
  }, []);

  const removeStudent = useCallback(async (id: string) => {
    await deleteDoc(doc(getDb(), "students", id));
  }, []);

  return { students, loading, createStudent, updateStudent, removeStudent };
}
