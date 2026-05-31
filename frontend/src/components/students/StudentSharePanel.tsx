import { useMemo, useState } from "react";
import type { AuthError } from "firebase/auth";
import { arrayRemove, arrayUnion, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Check, Copy, Link2, Mail, Plus, Share2, Trash2 } from "lucide-react";
import { SafeForm } from "@/components/forms/SafeForm";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { getDb } from "@/lib/firebase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface StudentSharePanelProps {
  studentId: string;
  viewerEmails?: string[];
}

/**
 * 教師用：生徒の成果物を「閲覧専用」で共有する招待管理パネル。
 * - メールを追加すると、その本人だけが（編集不可で）カルテと添削結果を閲覧できる
 * - 招待された人は Google でもメールリンクでもログイン可能
 */
export function StudentSharePanel({ studentId, viewerEmails }: StudentSharePanelProps) {
  const { sendInviteLink } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const emails = useMemo(
    () => [...(viewerEmails ?? [])].sort((a, b) => a.localeCompare(b)),
    [viewerEmails],
  );

  const inviteUrl = `${window.location.origin}/viewer/login`;

  const addViewer = async () => {
    const normalized = email.trim().toLowerCase();
    setError("");
    setNotice("");
    setWarning("");
    if (!EMAIL_PATTERN.test(normalized)) {
      setError("メールアドレスの形式が正しくありません");
      return;
    }
    if (emails.includes(normalized)) {
      setError("すでに招待済みのメールアドレスです");
      return;
    }
    setBusy(true);
    try {
      // 1) 閲覧権限を登録（これだけでアクセス許可は完了）
      await updateDoc(doc(getDb(), "students", studentId), {
        viewerEmails: arrayUnion(normalized),
        updatedAt: serverTimestamp(),
      });
      setEmail("");
      // 2) 本人宛にログインリンクを自動送信
      try {
        await sendInviteLink(normalized);
        setNotice(`${normalized} にログインリンクを送信しました`);
      } catch (sendErr) {
        const code = (sendErr as AuthError | undefined)?.code;
        if (code === "auth/operation-not-allowed") {
          setWarning(
            "閲覧の許可は登録しました。ただしメール送信（メールリンク認証）が未設定のため、リンクは送れませんでした。Firebase で「メール/パスワード → メールリンク」を有効にするか、下の招待リンクを手動でお渡しください。",
          );
        } else {
          setWarning(
            "閲覧の許可は登録しました。メール送信に失敗したため、下の招待リンクを手動でお渡しください。",
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "招待の保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const removeViewer = async (target: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    setWarning("");
    try {
      await updateDoc(doc(getDb(), "students", studentId), {
        viewerEmails: arrayRemove(target),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "招待の取り消しに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError("リンクのコピーに失敗しました。手動でコピーしてください。");
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <CardHeader className="p-0">
        <CardTitle className="flex items-center gap-2 font-ja text-base">
          <Share2 className="h-5 w-5 shrink-0 text-blue-800" />
          閲覧専用で共有（生徒・保護者）
        </CardTitle>
        <CardDescription className="font-ja leading-relaxed">
          メールアドレスを追加すると、その本人へ<strong>ログインリンクを自動送信</strong>します。
          招待された人だけが、この生徒の<strong>カルテと添削結果を閲覧</strong>できます（編集や書き込みは一切できません）。
          ログインは <span className="font-en">Google</span> でも、それ以外のメールでも可能です。
        </CardDescription>
      </CardHeader>

      <SafeForm className="flex flex-col gap-2 sm:flex-row" onSafeSubmit={addViewer}>
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="invite@example.com"
            className="pl-9 font-en"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            aria-label="招待するメールアドレス"
          />
        </div>
        <Button type="button" className="min-h-11 gap-2" onClick={addViewer} disabled={busy}>
          <Plus className="h-4 w-4" />
          招待する
        </Button>
      </SafeForm>

      {error && <p className="font-ja text-sm text-red-600">{error}</p>}
      {notice && (
        <p className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 font-ja text-sm text-green-800">
          <Check className="h-4 w-4 shrink-0" />
          {notice}
        </p>
      )}
      {warning && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-ja text-sm leading-relaxed text-amber-900">
          {warning}
        </p>
      )}

      {emails.length > 0 ? (
        <ul className="space-y-2">
          {emails.map((addr) => (
            <li
              key={addr}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate font-en text-sm text-slate-800">{addr}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-10 min-w-10 shrink-0 text-slate-500 hover:text-red-600"
                onClick={() => removeViewer(addr)}
                disabled={busy}
                aria-label={`${addr} の共有を解除`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-ja text-sm text-slate-500">まだ誰にも共有していません。</p>
      )}

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-slate-100 px-3 py-2">
          <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate font-en text-xs text-slate-600">{inviteUrl}</span>
        </div>
        <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={copyInviteLink}>
          {linkCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          {linkCopied ? "コピーしました" : "招待リンクをコピー"}
        </Button>
      </div>
      <p className="font-ja text-xs leading-relaxed text-slate-500">
        ※ リンク単体では閲覧できません。<strong>招待したメール本人のログイン</strong>が必要です（リンク漏洩時も第三者は閲覧不可）。
      </p>
    </Card>
  );
}
