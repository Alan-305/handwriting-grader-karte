import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";

/** 教師の途中保存タイムスタンプを更新（確定申告型のチェックポイント） */
export async function touchSessionDraft(sessionId: string): Promise<void> {
  await updateDoc(doc(getDb(), "sessions", sessionId), {
    draftSavedAt: serverTimestamp(),
  });
}
