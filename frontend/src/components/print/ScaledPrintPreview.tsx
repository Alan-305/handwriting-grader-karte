import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A4幅（210mm）固定の印刷プレビューを、表示枠の幅に合わせて縮小表示する。
 * 中身は実寸のままなので、印刷・PDF出力には影響しない。
 */
export function ScaledPrintPreview({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const update = () => {
      const innerWidth = inner.offsetWidth;
      const innerHeight = inner.offsetHeight;
      if (innerWidth <= 0) return;
      const next = Math.min(1, outer.clientWidth / innerWidth);
      setScale(next);
      setScaledHeight(innerHeight * next);
    };

    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    update();
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outerRef} className={cn("min-w-0", className)}>
      <div style={{ height: scaledHeight }} className="print:h-auto">
        <div
          ref={innerRef}
          className="w-fit print:w-auto print:transform-none"
          style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
