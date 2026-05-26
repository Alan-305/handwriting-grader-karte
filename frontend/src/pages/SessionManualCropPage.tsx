import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getDownloadURL, ref } from "firebase/storage";
import { PageContent, PageHeader } from "@/components/layout/AppShell";
import { ErrorRetry } from "@/components/feedback/ErrorRetry";
import { LoadingOverlay } from "@/components/feedback/LoadingOverlay";
import { InlineLoading } from "@/components/feedback/LoadingOverlay";
import {
  ManualQuestionCropEditor,
  targetKey,
  targetLabel,
  type CropTargetItem,
} from "@/components/sessions/ManualQuestionCropEditor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { apiClient } from "@/lib/api-client";
import { getStorageInstance } from "@/lib/firebase";
import type { CropTargetsResponse } from "@/types/api";
import type { CropRegion } from "@/types/firestore";

export function SessionManualCropPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { getIdToken } = useAuth();

  const [data, setData] = useState<CropTargetsResponse | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [draftRegion, setDraftRegion] = useState<CropRegion | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await apiClient.getCropTargets(token, sessionId);
      setData(res);
      const urls = await Promise.all(
        res.alignedImagePaths.map((path) =>
          getDownloadURL(ref(getStorageInstance(), path)),
        ),
      );
      setImageUrls(urls);
      if (res.targets.length > 0) {
        const first = res.targets[0];
        setActiveKey((prev) => prev ?? targetKey(first.order, first.partIndex));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [sessionId, getIdToken]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const targets: CropTargetItem[] = useMemo(
    () => (data?.targets ?? []) as CropTargetItem[],
    [data],
  );

  const allAssigned = data?.allAssigned ?? false;

  const otherRegions = useMemo(() => {
    if (!activeKey) return [];
    return targets
      .filter((t) => targetKey(t.order, t.partIndex) !== activeKey)
      .filter((t) => t.savedRegion)
      .map((t, index) => ({
        key: targetKey(t.order, t.partIndex),
        label: targetLabel(t.order, t.partLabel),
        region: t.savedRegion!,
        index,
      }));
  }, [targets, activeKey]);

  const activeTarget = targets.find((t) => targetKey(t.order, t.partIndex) === activeKey);

  const handleSaveCrop = async () => {
    if (!sessionId || !activeTarget || !draftRegion) {
      setError("範囲をドラッグして指定してください");
      return;
    }
    if (draftRegion.width < 20 || draftRegion.height < 20) {
      setError("切り出し範囲が小さすぎます");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) return;
      const region: CropRegion = {
        ...draftRegion,
        pageIndex,
      };
      const res = await apiClient.saveManualCrop(token, sessionId, {
        order: activeTarget.order,
        partIndex: activeTarget.partIndex,
        cropRegion: region,
      });
      setData((prev) => {
        if (!prev) return prev;
        const key = targetKey(activeTarget.order, activeTarget.partIndex);
        return {
          ...prev,
          allAssigned: res.allAssigned,
          targets: prev.targets.map((t) =>
            targetKey(t.order, t.partIndex) === key
              ? {
                  ...t,
                  savedRegion: region,
                  croppedImagePath: res.croppedImagePath,
                }
              : t,
          ),
        };
      });
      const idx = targets.findIndex((t) => targetKey(t.order, t.partIndex) === activeKey);
      const next = targets[idx + 1];
      if (next) {
        setActiveKey(targetKey(next.order, next.partIndex));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleProceed = async () => {
    if (!sessionId) return;
    if (!allAssigned) {
      setError("すべての設問に切り出し範囲を設定してください");
      return;
    }
    setTranscribing(true);
    setError("");
    try {
      const token = await getIdToken();
      if (!token) return;
      await apiClient.transcribeSession(token, sessionId);
      navigate(`/sessions/${sessionId}/transcription`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取りに失敗しました");
    } finally {
      setTranscribing(false);
    }
  };

  if (loading) {
    return (
      <div className="page-content flex min-h-[40vh] items-center justify-center">
        <InlineLoading message="解答用紙を読み込んでいます…" />
      </div>
    );
  }

  if (!data || !imageUrls[pageIndex]) {
    return (
      <PageContent>
        {error ? <ErrorRetry message={error} onRetry={load} /> : null}
        <Button className="mt-4" variant="outline" asChild>
          <Link to="/sessions/new">答案添削へ戻る</Link>
        </Button>
      </PageContent>
    );
  }

  return (
    <div>
      <LoadingOverlay visible={saving || transcribing} message={transcribing ? "読み取り中" : "保存中"} />
      <PageHeader
        title="設問ごとに切り出し"
        description="教師が答案範囲を指定します（自動切り出しは使いません）"
      />

      <PageContent maxWidth="lg" className="space-y-6">
        <Card className="border-blue-100 bg-blue-50/80 p-4 font-ja text-sm leading-relaxed text-slate-700">
          <ol className="list-decimal space-y-1 pl-5">
            <li>リストから設問（第1問・第2問 (1) など）を選ぶ</li>
            <li>該当するページで、答案欄をドラッグして囲む</li>
            <li>「この設問に設定」を押す（次の設問へ進みます）</li>
            <li>すべて ✓ になったら「読み取りへ進む」</li>
          </ol>
        </Card>

        {imageUrls.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {imageUrls.map((_, i) => (
              <Button
                key={i}
                type="button"
                size="sm"
                variant={pageIndex === i ? "default" : "outline"}
                className="min-h-11"
                onClick={() => setPageIndex(i)}
              >
                {i + 1} 枚目
              </Button>
            ))}
          </div>
        )}

        <Card className="p-5">
          <ManualQuestionCropEditor
            imageUrl={imageUrls[pageIndex]}
            pageWidth={data.pageWidth}
            pageHeight={data.pageHeight}
            pageIndex={pageIndex}
            targets={targets}
            activeKey={activeKey}
            onSelectTarget={setActiveKey}
            draftRegion={draftRegion}
            onDraftChange={setDraftRegion}
            otherRegions={otherRegions}
          />
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            className="min-h-11 flex-1"
            disabled={!activeKey || !draftRegion || saving}
            onClick={handleSaveCrop}
          >
            {activeTarget
              ? `${targetLabel(activeTarget.order, activeTarget.partLabel)} に設定`
              : "この設問に設定"}
          </Button>
        </div>

        {error && <ErrorRetry message={error} onRetry={handleSaveCrop} />}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            className="min-h-11 flex-1"
            disabled={!allAssigned || transcribing}
            onClick={handleProceed}
          >
            読み取りへ進む（{targets.filter((t) => t.croppedImagePath).length}/{targets.length}）
          </Button>
          <Button className="min-h-11" variant="outline" asChild>
            <Link to="/sessions/new">やり直す</Link>
          </Button>
        </div>
      </PageContent>
    </div>
  );
}
