import { useCallback, useEffect, useRef, useState } from "react";
import type { CropRegion } from "@/types/firestore";
import { cn } from "@/lib/utils";

export interface CropOverlayItem {
  id: string;
  label: string;
  region: CropRegion;
  colorClass: string;
  warning?: boolean;
}

const OVERLAY_COLORS = [
  "border-blue-600 bg-blue-500/15 text-blue-900",
  "border-emerald-600 bg-emerald-500/15 text-emerald-900",
  "border-violet-600 bg-violet-500/15 text-violet-900",
  "border-amber-600 bg-amber-500/15 text-amber-900",
  "border-rose-600 bg-rose-500/15 text-rose-900",
  "border-cyan-600 bg-cyan-500/15 text-cyan-900",
];

export function overlayColorForIndex(index: number): string {
  return OVERLAY_COLORS[index % OVERLAY_COLORS.length];
}

export function AlignedSheetCropOverlay({
  imageUrl,
  pageWidth,
  pageHeight,
  overlays,
  headerExclusion,
  pageLabel,
}: {
  imageUrl: string;
  pageWidth: number;
  pageHeight: number;
  overlays: CropOverlayItem[];
  headerExclusion?: CropRegion | null;
  pageLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const updateScale = useCallback(() => {
    const img = wrapRef.current?.querySelector("img");
    if (!img || !img.clientWidth) return;
    setScale(img.clientWidth / pageWidth);
  }, [pageWidth]);

  useEffect(() => {
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [updateScale]);

  const boxStyle = (region: CropRegion) => ({
    left: region.x * scale,
    top: region.y * scale,
    width: region.width * scale,
    height: region.height * scale,
  });

  return (
    <div className="space-y-2">
      <p className="font-ja text-sm font-medium text-slate-700">{pageLabel}</p>
      <div
        ref={wrapRef}
        className="relative inline-block max-w-full overflow-auto rounded-xl border border-slate-200 bg-slate-100"
      >
        <img
          src={imageUrl}
          alt={pageLabel}
          className="block h-auto max-w-full"
          style={{ width: pageWidth }}
          draggable={false}
          onLoad={updateScale}
        />

        {headerExclusion && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-amber-500/90 bg-amber-400/10"
            style={boxStyle(headerExclusion)}
            aria-hidden
          >
            <span className="absolute left-1 top-1 rounded bg-amber-600 px-2 py-0.5 font-ja text-xs font-medium text-white">
              氏名欄など（読み取り対象外）
            </span>
          </div>
        )}

        {overlays.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-none absolute border-2",
              item.colorClass,
              item.warning && "border-red-600 ring-2 ring-red-400/60",
            )}
            style={boxStyle(item.region)}
          >
            <span
              className={cn(
                "absolute -top-7 left-0 max-w-[min(100%,12rem)] truncate rounded px-2 py-0.5 font-ja text-xs font-semibold shadow-sm",
                item.warning ? "bg-red-700 text-white" : "bg-slate-800 text-white",
              )}
            >
              {item.label}
              {item.warning ? " ⚠" : ""}
            </span>
          </div>
        ))}
      </div>
      <p className="font-ja text-xs text-slate-500">
        設計サイズ {pageWidth} × {pageHeight}px（表示は縮小）
      </p>
    </div>
  );
}
