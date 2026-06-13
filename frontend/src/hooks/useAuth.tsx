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
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getAuthInstance, getDb, isFirebaseConfigured } from "@/lib/firebase";

/** 教師＝編集者、viewer＝招待された閲覧専用ユーザー */
export type UserRole = "teacher" | "viewer";

/** 新規アカウント時のみ参照するログイン意図。既存教師は teachers ドキュメント有無で判定される */
const LOGIN_INTENT_KEY = "hgk_login_intent";
/** メールリンクログインの確認用に送信先メールを一時保存 */
const EMAIL_FOR_SIGNIN_KEY = "hgk_email_for_signin";

interface AuthContextValue {
  user: User | null;
  /** 認証 + ロール判定が完了するまで true */
  loading: boolean;
  role: UserRole | null;
  /** 教師ログイン（Google）。teachers ドキュメントを作成する */
  loginWithGoogle: () => Promise<void>;
  loginWithGoogleRedirect: () => Promise<void>;
  /** 閲覧者ログイン（Google）。teachers ドキュメントは作成しない */
  loginViewerWithGoogle: () => Promise<void>;
  /** 閲覧者ログイン（メールリンク送信）。Google 以外のメールでも利用可能 */
  sendViewerEmailLink: (email: string) => Promise<void>;
  /** 教師が招待時に、その本人宛へログインリンクを送る（自端末の状態は変更しない） */
  sendInviteLink: (email: string) => Promise<void>;
  /** 受信したメールリンクでサインインを完了する。リンクでなければ false を返す */
  completeViewerEmailLink: () => Promise<boolean>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

function setIntent(intent: UserRole) {
  try {
    window.localStorage.setItem(LOGIN_INTENT_KEY, intent);
  } catch {
    /* localStorage 不可環境では intent なしで動作 */
  }
}

function readIntent(): UserRole | null {
  try {
    const value = window.localStorage.getItem(LOGIN_INTENT_KEY);
    return value === "teacher" || value === "viewer" ? value : null;
  } catch {
    return null;
  }
}

/** メールリンクの着地先 URL。宛先メールを埋め込み、別端末でも再入力なしでサインインできるようにする */
function viewerFinishUrl(email: string): string {
  return `${window.location.origin}/viewer/finish?invitedEmail=${encodeURIComponent(email)}`;
}

async function ensureTeacherDoc(user: User) {
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
}

/**
 * ロールを判定する。
 * 1. teachers/{uid} が存在すれば教師（既存教師はここで確定）
 * 2. 存在しないが「教師ログイン」意図があれば teachers を作成して教師
 * 3. それ以外は閲覧者（teachers ドキュメントは作成しない）
 */
async function resolveRole(user: User): Promise<UserRole> {
  try {
    const teacherSnap = await getDoc(doc(getDb(), "teachers", user.uid));
    if (teacherSnap.exists()) return "teacher";
  } catch (error) {
    console.error("ロール判定（teachers 取得）に失敗しました:", error);
  }

  if (readIntent() === "teacher") {
    try {
      await ensureTeacherDoc(user);
      return "teacher";
    } catch (error) {
      console.error("先生プロフィールの作成に失敗しました:", error);
    }
  }

  return "viewer";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    void (async () => {
      try {
        await getRedirectResult(getAuthInstance());
      } catch (error) {
        console.error("リダイレクトログインに失敗しました:", error);
      }

      unsubscribe = onAuthStateChanged(getAuthInstance(), async (u) => {
        if (!u) {
          setUser(null);
          setRole(null);
          setLoading(false);
          return;
        }
        // ロール判定中は loading を維持し、ガードの誤発火（リダイレクトのちらつき）を防ぐ
        setLoading(true);
        const resolved = await resolveRole(u);
        setRole(resolved);
        setUser(u);
        setLoading(false);
      });
    })();

    return () => unsubscribe?.();
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setIntent("teacher");
    await signInWithPopup(getAuthInstance(), googleProvider);
  }, []);

  const loginWithGoogleRedirect = useCallback(async () => {
    setIntent("teacher");
    await signInWithRedirect(getAuthInstance(), googleProvider);
  }, []);

  const loginViewerWithGoogle = useCallback(async () => {
    setIntent("viewer");
    await signInWithPopup(getAuthInstance(), googleProvider);
  }, []);

  const sendViewerEmailLink = useCallback(async (email: string) => {
    const normalized = email.trim().toLowerCase();
    setIntent("viewer");
    await sendSignInLinkToEmail(getAuthInstance(), normalized, {
      url: viewerFinishUrl(normalized),
      handleCodeInApp: true,
    });
    try {
      window.localStorage.setItem(EMAIL_FOR_SIGNIN_KEY, normalized);
    } catch {
      /* 別端末で開く場合は URL の invitedEmail でフォールバック */
    }
  }, []);

  const sendInviteLink = useCallback(async (email: string) => {
    const normalized = email.trim().toLowerCase();
    // 教師の端末から送るため intent / localStorage は変更しない（受信者は別人・別端末）
    await sendSignInLinkToEmail(getAuthInstance(), normalized, {
      url: viewerFinishUrl(normalized),
      handleCodeInApp: true,
    });
  }, []);

  const completeViewerEmailLink = useCallback(async () => {
    const auth = getAuthInstance();
    if (!isSignInWithEmailLink(auth, window.location.href)) return false;
    setIntent("viewer");
    let email = "";
    try {
      email = window.localStorage.getItem(EMAIL_FOR_SIGNIN_KEY) ?? "";
    } catch {
      email = "";
    }
    if (!email) {
      // 教師から送られた招待リンクには宛先メールが URL に埋め込まれている
      email = new URLSearchParams(window.location.search).get("invitedEmail") ?? "";
    }
    if (!email) {
      email = window.prompt("確認のため、招待を受け取ったメールアドレスを入力してください") ?? "";
    }
    await signInWithEmailLink(auth, email.trim().toLowerCase(), window.location.href);
    try {
      window.localStorage.removeItem(EMAIL_FOR_SIGNIN_KEY);
    } catch {
      /* noop */
    }
    return true;
  }, []);

  const logout = useCallback(async () => {
    await signOut(getAuthInstance());
  }, []);

  const getIdToken = useCallback(async () => {
    if (!isFirebaseConfigured) return null;
    const auth = getAuthInstance();
    try {
      await auth.authStateReady();
    } catch (error) {
      console.error("認証状態の取得に失敗しました:", error);
      return null;
    }
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      role,
      loginWithGoogle,
      loginWithGoogleRedirect,
      loginViewerWithGoogle,
      sendViewerEmailLink,
      sendInviteLink,
      completeViewerEmailLink,
      logout,
      getIdToken,
    }),
    [
      user,
      loading,
      role,
      loginWithGoogle,
      loginWithGoogleRedirect,
      loginViewerWithGoogle,
      sendViewerEmailLink,
      sendInviteLink,
      completeViewerEmailLink,
      logout,
      getIdToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
