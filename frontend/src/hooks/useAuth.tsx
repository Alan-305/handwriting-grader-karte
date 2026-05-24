import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getAuthInstance, getDb, isFirebaseConfigured } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

async function ensureTeacherDoc(user: User) {
  try {
    const ref = doc(getDb(), "teachers", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName: user.displayName ?? "先生",
        email: user.email ?? "",
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error("先生プロフィールの作成に失敗しました:", error);
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(getAuthInstance(), async (u) => {
      try {
        if (u) await ensureTeacherDoc(u);
        setUser(u);
      } catch {
        // 認証は成功しているが Firestore 書き込みに失敗した場合もログイン状態は維持
        setUser(u);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const loginWithGoogle = useCallback(async () => {
    await signInWithPopup(getAuthInstance(), googleProvider);
  }, []);

  const logout = useCallback(async () => {
    await signOut(getAuthInstance());
  }, []);

  const getIdToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const value = useMemo(
    () => ({ user, loading, loginWithGoogle, logout, getIdToken }),
    [user, loading, loginWithGoogle, logout, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
