import { useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ChevronRight, Plus, Sparkles } from "lucide-react";
import { SafeForm } from "@/components/forms/SafeForm";
import { PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { slugifyUniversityId, usePastExamUniversities } from "@/hooks/usePastExamUniversities";
import { apiClient } from "@/lib/api-client";

export function PastExamsPage() {
  const { getIdToken } = useAuth();
  const { displayList, loading } = usePastExamUniversities();
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAddUniversity = async () => {
    setFormError(null);
    const trimmedName = name.trim();
    const finalSlug = slugifyUniversityId(slug.trim() || trimmedName);
    if (!trimmedName) {
      setFormError("大学名を入力してください");
      return;
    }
    if (!finalSlug) {
      setFormError("識別用 ID（英字）を入力してください（例: kyodai, waseda）");
      return;
    }

    setSaving(true);
    try {
      const token = await getIdToken();
      if (!token) {
        setFormError("ログインが必要です");
        return;
      }
      await apiClient.registerPastExamUniversity(token, {
        slug: finalSlug,
        name: trimmedName,
        nameEn: nameEn.trim() || undefined,
      });
      setName("");
      setSlug("");
      setNameEn("");
      setShowAddForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="過去問コーパス"
        description="大学ごとの過去問を年度単位で追加・管理します。大学を増やしてから、各大学の年度を取り込めます。"
      />
      <div className="page-content space-y-6">
        <Card className="border-blue-100 bg-blue-50/40">
          <CardHeader>
            <CardTitle className="font-ja text-base">柔軟な年度運用</CardTitle>
            <CardDescription className="font-ja leading-relaxed">
              東大以外の大学も「大学を追加」から登録できます。年度数に上限はなく、必要な年度だけ PDF
              を取り込んでください。
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <Plus className="h-4 w-4" />
            大学を追加
          </Button>
        </div>

        {showAddForm && (
          <Card>
            <SafeForm className="space-y-4 p-6" onSafeSubmit={handleAddUniversity}>
              <CardHeader className="p-0">
                <CardTitle className="font-ja text-base">過去問コーパスに大学を追加</CardTitle>
                <CardDescription className="font-ja">
                  識別用 ID は URL 用の英字です（例: <span className="font-en">kyodai</span>、
                  <span className="font-en">waseda</span>）。登録後、年度一覧から PDF を取り込めます。
                </CardDescription>
              </CardHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="font-ja text-sm text-slate-600">大学名（日本語）</label>
                  <Input
                    className="mt-1 font-ja"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例: 京都大学"
                  />
                </div>
                <div>
                  <label className="font-ja text-sm text-slate-600">識別用 ID（英字・任意）</label>
                  <Input
                    className="mt-1 font-en"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="例: kyodai"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="font-ja text-sm text-slate-600">英語名（任意）</label>
                  <Input
                    className="mt-1 font-en"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="Kyoto University"
                  />
                </div>
              </div>
              {formError && <p className="font-ja text-sm text-red-700">{formError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="min-h-11" disabled={saving} onClick={() => void handleAddUniversity()}>
                  {saving ? "登録中..." : "登録する"}
                </Button>
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setShowAddForm(false)}>
                  キャンセル
                </Button>
              </div>
            </SafeForm>
          </Card>
        )}

        {loading ? (
          <p className="font-ja text-sm text-slate-500">読み込み中...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {displayList.map((uni) => (
              <Card key={uni.id} className="flex flex-col justify-between">
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-ja text-lg font-semibold text-slate-900">{uni.name}</h2>
                      {uni.nameEn && (
                        <p className="font-en mt-1 text-sm text-slate-500">{uni.nameEn}</p>
                      )}
                    </div>
                    <Archive className="h-5 w-5 shrink-0 text-blue-800" />
                  </div>
                  <p className="mt-3 font-ja text-sm text-slate-600">
                    登録済みの過去問年度を確認したり、新しい年度を取り込んだり、問題を生成できます。
                  </p>
                </div>
                <div className="flex flex-col gap-2 border-t border-slate-100 p-4 sm:flex-row sm:flex-wrap">
                  <Button asChild className="min-h-11 flex-1 gap-2 sm:min-w-[10rem]">
                    <Link to={`/past-exams/${uni.slug}/generate`}>
                      <Sparkles className="h-4 w-4" />
                      問題を生成
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="min-h-11 flex-1 gap-2 sm:min-w-[10rem]">
                    <Link to={`/past-exams/${uni.slug}`}>
                      年度一覧を開く
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="min-h-11 flex-1 gap-2 sm:min-w-[10rem]">
                    <Link to={`/past-exams/${uni.slug}/import`}>
                      <Plus className="h-4 w-4" />
                      PDF を取り込む
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
