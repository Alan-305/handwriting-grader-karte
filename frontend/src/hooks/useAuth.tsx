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
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getAuthInstance, getDb, isFirebaseConfigured } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithGoogleRedirect: () => Promise<void>;
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

    let unsubscribe: (() => void) | undefined;

    void (async () => {
      try {
        const result = await getRedirectResult(getAuthInstance());
        if (result?.user) await ensureTeacherDoc(result.user);
      } catch (error) {
        console.error("Google リダイレクトログインに失敗しました:", error);
      }

      unsubscribe = onAuthStateChanged(getAuthInstance(), async (u) => {
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
    })();

    return () => unsubscribe?.();
  }, []);

  const loginWithGoogle = useCallback(async () => {
    await signInWithPopup(getAuthInstance(), googleProvider);
  }, []);

  const loginWithGoogleRedirect = useCallback(async () => {
    await signInWithRedirect(getAuthInstance(), googleProvider);
  }, []);

  const logout = useCallback(async () => {
    await signOut(getAuthInstance());
  }, []);

  const getIdToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  const value = useMemo(
    () => ({ user, loading, loginWithGoogle, loginWithGoogleRedirect, logout, getIdToken }),
    [user, loading, loginWithGoogle, loginWithGoogleRedirect, logout, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
