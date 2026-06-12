import type { ElementType, ReactNode } from "react";
import { previewAnchorId } from "@/lib/preview-anchor";
import { cn } from "@/lib/utils";

/** 印刷プレビュー内のスクロール連動用マーカー（印刷には影響しない） */
export function PreviewAnchor({
  anchor,
  as: Tag = "div",
  className,
  children,
}: {
  anchor: string;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Tag id={previewAnchorId(anchor)} className={cn(className)}>
      {children}
    </Tag>
  );
}
