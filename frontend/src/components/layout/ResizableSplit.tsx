import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

const MIN_RATIO = 0.25;
const MAX_RATIO = 0.78;

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

function loadRatio(storageKey: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(`split-ratio:${storageKey}`);
    if (raw) return clampRatio(Number(raw));
  } catch {
    /* ignore */
  }
  return clampRatio(fallback);
}

/**
 * PC（lg以上）では左右2ペイン + ドラッグで幅を調整できるスプリッタ。
 * lg未満では縦に積む。比率は localStorage に保存される。
 */
export function ResizableSplit({
  storageKey,
  defaultRatio = 0.5,
  left,
  right,
  className,
}: {
  storageKey: string;
  defaultRatio?: number;
  left: ReactNode;
  right: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(() => loadRatio(storageKey, defaultRatio));
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(`split-ratio:${storageKey}`, String(ratio));
    } catch {
      /* ignore */
    }
  }, [storageKey, ratio]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      setRatio(clampRatio((e.clientX - rect.left) / rect.width));
    },
    [dragging],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "lg:flex lg:min-h-0 lg:flex-row",
        dragging && "cursor-col-resize select-none",
        className,
      )}
      style={{ "--split-left": `${(ratio * 100).toFixed(2)}%` } as CSSProperties}
    >
      <div className="min-w-0 lg:h-full lg:w-[var(--split-left)] lg:shrink-0 lg:overflow-y-auto">
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="左右の幅を調整"
        className={cn(
          "no-print hidden w-2.5 shrink-0 cursor-col-resize items-center justify-center border-x border-slate-200 bg-slate-100 transition-colors hover:bg-blue-100 lg:flex",
          dragging && "bg-blue-200",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="h-10 w-1 rounded-full bg-slate-400" />
      </div>
      <div className="min-w-0 lg:h-full lg:flex-1 lg:overflow-y-auto">{right}</div>
    </div>
  );
}
