import { useCallback, useEffect, useState } from "react";
import {
  normalizeCropRect,
  useCropCanvasCoords,
} from "@/hooks/useCropCanvasCoords";
import { overlayColorForIndex } from "@/components/sessions/AlignedSheetCropOverlay";
import type { CropRegion } from "@/types/firestore";
import { cn } from "@/lib/utils";

export interface CropTargetItem {
  questionId: string;
  order: number;
  partIndex: number;
  partLabel?: string;
  suggestedRegion?: CropRegion;
  savedRegion?: CropRegion;
  croppedImagePath?: string;
}

export function targetKey(order: number, partIndex: number) {
  return `${order}-${partIndex}`;
}

export function targetLabel(order: number, partLabel?: string) {
  return partLabel ? `第${order}問 ${partLabel}` : `第${order}問`;
}

export function ManualQuestionCropEditor({
  imageUrl,
  pageWidth,
  pageHeight,
  pageIndex,
  targets,
  activeKey,
  onSelectTarget,
  draftRegion,
  onDraftChange,
  otherRegions,
}: {
  imageUrl: string;
  pageWidth: number;
  pageHeight: number;
  pageIndex: number;
  targets: CropTargetItem[];
  activeKey: string | null;
  onSelectTarget: (key: string) => void;
  draftRegion: CropRegion | null;
  onDraftChange: (region: CropRegion | null) => void;
  otherRegions: Array<{ key: string; label: string; region: CropRegion; index: number }>;
}) {
  const { wrapRef, scale, updateScale, clientToPage } = useCropCanvasCoords(pageWidth);
  const [drawing, setDrawing] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );

  const boxStyle = (region: CropRegion) => ({
    left: region.x * scale,
    top: region.y * scale,
    width: region.width * scale,
    height: region.height * scale,
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!activeKey || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.dataset.handle) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = clientToPage(e.clientX, e.clientY);
    setDrawing({ x1: x, y1: y, x2: x, y2: y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const { x, y } = clientToPage(e.clientX, e.clientY);
    setDrawing({ ...drawing, x2: x, y2: y });
  };

  const onPointerUp = () => {
    if (!drawing) return;
    const region = normalizeCropRect(
      drawing.x1,
      drawing.y1,
      drawing.x2,
      drawing.y2,
      pageWidth,
      pageHeight,
    );
    if (region.width >= 20 && region.height >= 20) {
      onDraftChange({ ...region, pageIndex });
    }
    setDrawing(null);
  };

  const previewRegion =
    drawing &&
    normalizeCropRect(drawing.x1, drawing.y1, drawing.x2, drawing.y2, pageWidth, pageHeight);

  const applySuggested = useCallback(() => {
    const active = targets.find((t) => targetKey(t.order, t.partIndex) === activeKey);
    const suggested = active?.savedRegion ?? active?.suggestedRegion;
    if (suggested) {
      onDraftChange({ ...suggested, pageIndex: suggested.pageIndex ?? pageIndex });
    }
  }, [activeKey, targets, onDraftChange, pageIndex]);

  useEffect(() => {
    if (!activeKey) return;
    const active = targets.find((t) => targetKey(t.order, t.partIndex) === activeKey);
    if (active?.savedRegion) {
      onDraftChange({ ...active.savedRegion });
    } else if (active?.suggestedRegion && (active.suggestedRegion.pageIndex ?? 0) === pageIndex) {
      onDraftChange({ ...active.suggestedRegion });
    } else {
      onDraftChange(null);
    }
  }, [activeKey, pageIndex, targets, onDraftChange]);

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-56">
        <p className="mb-2 font-ja text-sm font-medium text-slate-700">設問を選択</p>
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:max-h-64 lg:max-h-[420px]">
          {targets.map((t) => {
            const key = targetKey(t.order, t.partIndex);
            const done = Boolean(t.croppedImagePath);
            const isActive = key === activeKey;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-ja text-sm transition-colors",
                    isActive
                      ? "bg-blue-800 text-white"
                      : "hover:bg-slate-100 text-slate-800",
                  )}
                  onClick={() => onSelectTarget(key)}
                >
                  <span>{targetLabel(t.order, t.partLabel)}</span>
                  <span className={cn("text-xs", isActive ? "text-blue-100" : "text-slate-500")}>
                    {done ? "✓" : "未"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {activeKey && (
          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 font-ja text-xs text-slate-600 hover:bg-slate-50"
            onClick={applySuggested}
          >
            テンプレート位置を枠に反映
          </button>
        )}
      </aside>

      <div className="min-w-0 flex-1">
        <p className="mb-2 font-ja text-sm text-slate-600">
          {activeKey
            ? "画像上をドラッグして、この設問の答案範囲を指定してください"
            : "上のリストから設問を選んでください"}
        </p>
        <div
          ref={wrapRef}
          className="relative inline-block w-full max-w-full cursor-crosshair touch-none select-none overflow-visible rounded-xl border border-slate-300 bg-slate-100"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <img
            src={imageUrl}
            alt="整列済み解答用紙"
            className="block h-auto w-full max-w-full"
            style={{ maxWidth: pageWidth }}
            draggable={false}
            onLoad={updateScale}
          />

          {otherRegions
            .filter((o) => (o.region.pageIndex ?? 0) === pageIndex)
            .map((o) => (
              <div
                key={o.key}
                className={cn(
                  "pointer-events-none absolute border-2 opacity-60",
                  overlayColorForIndex(o.index),
                )}
                style={boxStyle(o.region)}
              >
                <span className="absolute -top-6 left-0 rounded bg-slate-700 px-1.5 py-0.5 font-ja text-[10px] text-white">
                  {o.label}
                </span>
              </div>
            ))}

          {draftRegion && (draftRegion.pageIndex ?? 0) === pageIndex && (
            <div
              className="pointer-events-none absolute border-2 border-blue-600 bg-blue-500/20"
              style={boxStyle(draftRegion)}
            />
          )}

          {previewRegion && previewRegion.width > 0 && previewRegion.height > 0 && (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-blue-400 bg-blue-300/10"
              style={boxStyle({ ...previewRegion, pageIndex })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
