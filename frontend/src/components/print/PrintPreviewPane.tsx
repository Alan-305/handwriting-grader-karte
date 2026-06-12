import type { ReactNode, RefObject } from "react";
import { PreviewScrollArea } from "@/components/layout/PreviewScrollRegisterContext";
import { ScaledPrintPreview } from "@/components/print/ScaledPrintPreview";
import { cn } from "@/lib/utils";

/** 左右分割の右ペイン：ヘッダー固定 + 独立スクロールの印刷プレビュー */
export function PrintPreviewPane({
  title = "印刷プレビュー",
  hint,
  printRef,
  scrollRef,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  printRef?: RefObject<HTMLDivElement | null>;
  /** プレビュー連動スクロール用（この要素が縦スクロールする） */
  scrollRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-slate-100", className)}>
      <div className="no-print shrink-0 border-b border-slate-200 bg-white px-4 py-2">
        <span className="font-ja text-sm font-medium text-slate-600">{title}</span>
        {hint ? (
          <p className="mt-0.5 font-ja text-xs text-slate-500">{hint}</p>
        ) : null}
      </div>
      <PreviewScrollArea scrollRef={scrollRef}>
        <ScaledPrintPreview className="box-border p-4 pb-8 print:p-0">
          {printRef ? <div ref={printRef}>{children}</div> : children}
        </ScaledPrintPreview>
      </PreviewScrollArea>
    </div>
  );
}
