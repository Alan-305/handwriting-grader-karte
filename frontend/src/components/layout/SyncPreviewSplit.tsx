import { useRef, type ReactNode, type RefObject } from "react";
import { ResizableSplit } from "@/components/layout/ResizableSplit";
import { usePreviewScrollSync } from "@/hooks/usePreviewScrollSync";

/** 左右分割 + 左編集フォーカスに連動する右プレビュースクロール */
export function SyncPreviewSplit({
  storageKey,
  defaultRatio = 0.5,
  className,
  left,
  right,
  previewScrollRef,
  syncEnabled = true,
}: {
  storageKey: string;
  defaultRatio?: number;
  className?: string;
  left: ReactNode;
  right: ReactNode;
  previewScrollRef: RefObject<HTMLElement | null>;
  syncEnabled?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  usePreviewScrollSync(editorRef, previewScrollRef, syncEnabled);

  return (
    <ResizableSplit
      storageKey={storageKey}
      defaultRatio={defaultRatio}
      className={className}
      left={
        <div ref={editorRef} className="min-h-0 lg:h-full">
          {left}
        </div>
      }
      right={right}
    />
  );
}
