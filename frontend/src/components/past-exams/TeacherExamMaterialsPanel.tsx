import { useCallback, useEffect, useRef, useState } from "react";
import { getDownloadURL, ref, uploadBytes, deleteObject } from "firebase/storage";
import { FileText, Paperclip, Save, Trash2, Upload } from "lucide-react";
import { SafeForm } from "@/components/forms/SafeForm";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { confirmDeleteTarget } from "@/lib/confirm-delete";
import { getStorageInstance } from "@/lib/firebase";
import type { TeacherExamMaterialAttachment } from "@/types/past-exam";

const ACCEPTED_TYPES = ".pdf,.txt,.md,.doc,.docx,application/pdf,text/plain";

const EMPTY_DEFAULTS = (year: number) => ({
  title: `${year}年度 分析メモ`,
  content: "",
  attachments: [] as TeacherExamMaterialAttachment[],
});

export function TeacherExamMaterialsPanel({
  universitySlug,
  year,
}: {
  universitySlug: string;
  year: number;
}) {
  const { user, getIdToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(() => EMPTY_DEFAULTS(year).title);
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<TeacherExamMaterialAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const loadMaterial = useCallback(async () => {
    setLoadWarning(null);
    const token = await getIdToken();
    if (!token) {
      setLoading(false);
      setLoadWarning("ログイン後に分析資料を保存できます");
      return;
    }
    try {
      const { material } = await apiClient.getTeacherExamMaterial(token, universitySlug, year);
      if (material) {
        setTitle(material.title || EMPTY_DEFAULTS(year).title);
        setContent(material.content || "");
        setAttachments(material.attachments || []);
      } else {
        const defaults = EMPTY_DEFAULTS(year);
        setTitle(defaults.title);
        setContent(defaults.content);
        setAttachments(defaults.attachments);
      }
    } catch (err) {
      const defaults = EMPTY_DEFAULTS(year);
      setTitle(defaults.title);
      setContent(defaults.content);
      setAttachments(defaults.attachments);
      setLoadWarning(
        err instanceof Error
          ? `${err.message} — 空のフォームから入力・保存できます`
          : "読み込みに失敗しました — 空のフォームから入力・保存できます",
      );
    } finally {
      setLoading(false);
    }
  }, [getIdToken, universitySlug, year]);

  useEffect(() => {
    void loadMaterial();
  }, [loadMaterial]);

  const persist = async (
    nextTitle: string,
    nextContent: string,
    nextAttachments: TeacherExamMaterialAttachment[],
  ) => {
    if (!user) return;
    setSaving(true);
    setError(null);
    const token = await getIdToken();
    if (!token) {
      setError("ログインが必要です");
      setSaving(false);
      return;
    }
    try {
      await apiClient.saveTeacherExamMaterial(token, universitySlug, year, {
        title: nextTitle,
        content: nextContent,
        attachments: nextAttachments,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => persist(title, content, attachments);

  const handleUpload = async () => {
    if (!user) return;
    const files = fileInputRef.current?.files;
    if (!files?.length) {
      setError("ファイルを選択してください");
      return;
    }

    setUploading(true);
    setError(null);
    const nextAttachments = [...attachments];

    try {
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^\w.\-()\u3000-\u9FFF]/g, "_");
        const storagePath = `teachers/${user.uid}/exam-materials/${universitySlug}/${year}/${Date.now()}_${safeName}`;
        await uploadBytes(ref(getStorageInstance(), storagePath), file, {
          contentType: file.type || "application/octet-stream",
        });
        nextAttachments.push({
          name: file.name,
          storagePath,
          contentType: file.type || "application/octet-stream",
        });
      }
      setAttachments(nextAttachments);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await persist(title, content, nextAttachments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (index: number) => {
    if (!user) return;
    const target = attachments[index];
    if (!confirmDeleteTarget(target.name)) return;
    const next = attachments.filter((_, i) => i !== index);
    setAttachments(next);
    try {
      await deleteObject(ref(getStorageInstance(), target.storagePath));
    } catch {
      // Storage に無くてもメタデータからは外す
    }
    await persist(title, content, next);
  };

  const openAttachment = async (attachment: TeacherExamMaterialAttachment) => {
    try {
      const url = await getDownloadURL(ref(getStorageInstance(), attachment.storagePath));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ファイルを開けませんでした");
    }
  };

  if (!user) return null;

  return (
    <Card className="border-violet-100 bg-violet-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-ja text-base">
          <FileText className="h-5 w-5 text-violet-800" />
          教師分析資料
        </CardTitle>
        <CardDescription className="font-ja leading-relaxed">
          取り込み前・取り込み後いつでも追加・修正できます。入試分析メモ、出題傾向、指導方針、PDF などをこの年度に紐付けて保存します。
        </CardDescription>
      </CardHeader>

      {loading ? (
        <div className="px-6 pb-6">
          <InlineLoading message="分析資料を読み込み中..." />
        </div>
      ) : (
        <SafeForm className="space-y-5 px-6 pb-6" onSafeSubmit={handleSave}>
          {loadWarning && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 font-ja text-sm text-amber-900">
              {loadWarning}
            </p>
          )}

          <div className="space-y-1">
            <label className="font-ja text-sm text-slate-600">タイトル</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`${year}年度 出題傾向分析`}
            />
          </div>

          <div className="space-y-1">
            <label className="font-ja text-sm text-slate-600">分析内容</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="大問ごとの傾向、指導上のポイント、過去との比較などを記入してください"
              className="font-ja"
            />
          </div>

          <div className="space-y-3 rounded-lg border border-violet-100 bg-white p-4">
            <p className="font-ja text-sm font-medium text-slate-700">添付ファイル（任意）</p>
            <div className="flex flex-wrap items-end gap-3">
              <Input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                className="max-w-md"
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2"
                disabled={uploading || saving}
                onClick={handleUpload}
              >
                <Upload className="h-4 w-4" />
                {uploading ? "アップロード中..." : "ファイルを追加"}
              </Button>
            </div>

            {attachments.length > 0 && (
              <ul className="space-y-2 pt-2">
                {attachments.map((attachment, index) => (
                  <li
                    key={attachment.storagePath}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <button
                      type="button"
                      className="flex min-h-11 items-center gap-2 font-ja text-sm text-blue-800 hover:underline"
                      onClick={() => openAttachment(attachment)}
                    >
                      <Paperclip className="h-4 w-4 shrink-0" />
                      {attachment.name}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 text-red-700"
                      onClick={() => removeAttachment(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-ja text-sm text-red-800">
              {error}
            </p>
          )}
          {saved && (
            <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-ja text-sm text-green-800">
              分析資料を保存しました
            </p>
          )}

          <Button type="button" className="min-h-11 gap-2" disabled={saving || uploading} onClick={handleSave}>
            <Save className="h-4 w-4" />
            {saving ? "保存中..." : "分析資料を保存"}
          </Button>
        </SafeForm>
      )}
    </Card>
  );
}
