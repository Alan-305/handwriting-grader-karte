import { useCallback, useEffect, useRef, useState } from "react";

export function useCropCanvasCoords(pageWidth: number) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const updateScale = useCallback(() => {
    const img = wrapRef.current?.querySelector("img");
    if (!img?.clientWidth) return;
    setScale(img.clientWidth / pageWidth);
  }, [pageWidth]);

  useEffect(() => {
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [updateScale]);

  const clientToPage = useCallback(
    (clientX: number, clientY: number) => {
      const img = wrapRef.current?.querySelector("img");
      if (!img) return { x: 0, y: 0 };
      const rect = img.getBoundingClientRect();
      return {
        x: Math.max(0, (clientX - rect.left) / scale),
        y: Math.max(0, (clientY - rect.top) / scale),
      };
    },
    [scale],
  );

  return { wrapRef, scale, updateScale, clientToPage };
}

export function normalizeCropRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pageWidth: number,
  pageHeight: number,
) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  return {
    x: Math.round(Math.max(0, Math.min(x, pageWidth - 1))),
    y: Math.round(Math.max(0, Math.min(y, pageHeight - 1))),
    width: Math.round(Math.min(width, pageWidth - x)),
    height: Math.round(Math.min(height, pageHeight - y)),
  };
}
