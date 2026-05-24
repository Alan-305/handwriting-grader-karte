import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SetupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Firebase の設定が必要です</CardTitle>
          <CardDescription>
            白い画面の原因は、Firebase の環境変数が未設定のことが多いです。
          </CardDescription>
        </CardHeader>
        <div className="space-y-4 font-ja text-sm leading-relaxed text-slate-700">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <a
                className="text-blue-800 underline"
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noreferrer"
              >
                Firebase Console
              </a>
              でプロジェクトを作成
            </li>
            <li>Authentication → Google を有効化。Firestore、Storage も有効化</li>
            <li>プロジェクト設定 → ウェブアプリから設定値をコピー</li>
            <li>
              <code className="rounded bg-slate-100 px-1">frontend/.env.local</code> に貼り付け
            </li>
            <li>
              開発サーバーを再起動（<code className="rounded bg-slate-100 px-1">npm run dev</code>
              ）
            </li>
          </ol>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
{`VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123`}
          </pre>
          <p className="text-slate-500">
            バックエンド用の <code className="rounded bg-slate-100 px-1">.env</code> にも同じ
            プロジェクト ID とサービスアカウント JSON のパスを設定してください。
          </p>
        </div>
      </Card>
    </div>
  );
}
