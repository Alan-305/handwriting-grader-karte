import { useRef, useState } from "react";
import type { CropRegion } from "@/types/firestore";

export function CropPreview({
  imageUrl,
  regions,
  onRegionChange,
  selectedIndex,
  onSelect,
}: {
  imageUrl: string;
  regions: CropRegion[];
  selectedIndex: number;
  onRegionChange: (index: number, region: CropRegion) => void;
  onSelect: (index: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"move" | "resize" | null>(null);
  const [start, setStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent, index: number, mode: "move" | "resize") => {
    e.stopPropagation();
    onSelect(index);
    setDragging(mode);
    setStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || selectedIndex < 0) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    setStart({ x: e.clientX, y: e.clientY });
    const region = regions[selectedIndex];
    if (dragging === "move") {
      onRegionChange(selectedIndex, {
        ...region,
        x: Math.max(0, region.x + dx),
        y: Math.max(0, region.y + dy),
      });
    } else {
      onRegionChange(selectedIndex, {
        ...region,
        width: Math.max(20, region.width + dx),
        height: Math.max(20, region.height + dy),
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-block max-w-full overflow-auto rounded-xl border border-slate-200"
      onMouseMove={handleMouseMove}
      onMouseUp={() => setDragging(null)}
      onMouseLeave={() => setDragging(null)}
    >
      <img src={imageUrl} alt="解答用紙プレビュー" className="max-h-[600px] w-auto" draggable={false} />
      {regions.map((r, i) => (
        <div
          key={i}
          className={`absolute border-2 ${i === selectedIndex ? "border-blue-600 bg-blue-500/10" : "border-green-500/70 bg-green-500/5"}`}
          style={{ left: r.x, top: r.y, width: r.width, height: r.height }}
          onMouseDown={(e) => handleMouseDown(e, i, "move")}
        >
          <span className="absolute -top-6 left-0 rounded bg-slate-800 px-2 py-0.5 text-xs text-white">
            Q{i + 1}
          </span>
          <div
            className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize bg-blue-600"
            onMouseDown={(e) => handleMouseDown(e, i, "resize")}
          />
        </div>
      ))}
    </div>
  );
}
