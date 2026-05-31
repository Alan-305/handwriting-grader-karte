import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  // 認証メール（ログインリンク等）を日本語テンプレートで送信する
  authInstance.languageCode = "ja";
  dbInstance = getFirestore(app);
  storageInstance = getStorage(app);
}

export function getAuthInstance(): Auth {
  if (!authInstance) throw new Error("Firebase が設定されていません");
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) throw new Error("Firebase が設定されていません");
  return dbInstance;
}

export function getStorageInstance(): FirebaseStorage {
  if (!storageInstance) throw new Error("Firebase が設定されていません");
  return storageInstance;
}

export { app };
