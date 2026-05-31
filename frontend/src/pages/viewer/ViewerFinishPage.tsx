import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { useAuth } from "@/hooks/useAuth";

/** メールのログインリンクを開いた着地ページ。サインインを完了して閲覧ホームへ遷移する */
export function ViewerFinishPage() {
  const { completeViewerEmailLink } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      try {
        const completed = await completeViewerEmailLink();
        if (completed) {
          navigate("/viewer", { replace: true });
        } else {
          navigate("/viewer/login", { replace: true });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "ログインの確認に失敗しました");
      }
    })();
  }, [completeViewerEmailLink, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>ログインを確認しています</CardTitle>
          <CardDescription className="font-ja">少々お待ちください</CardDescription>
        </CardHeader>
        <div className="space-y-4 px-6 pb-6">
          {error ? (
            <>
              <p className="text-center font-ja text-sm text-red-600">{error}</p>
              <Button asChild variant="outline" className="h-11 w-full">
                <Link to="/viewer/login">ログイン画面に戻る</Link>
              </Button>
            </>
          ) : (
            <InlineLoading message="考えてます" className="justify-center py-4" />
          )}
        </div>
      </Card>
    </div>
  );
}
