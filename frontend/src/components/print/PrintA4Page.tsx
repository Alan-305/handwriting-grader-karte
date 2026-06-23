import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/** 流し込み印刷（表紙＋複数大問を自然改ページ。大問ブロックは途中で切れない） */
export function PrintFlowDocument({
  children,
  className = "",
  style,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "style">) {
  return (
    <div
      className={`print-flow-document print-document mx-auto box-border bg-white text-slate-900 shadow-lg print:shadow-none ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}

/** A4 1枚分の固定ページ */
export function PrintA4Page({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`print-page relative mx-auto box-border bg-white text-slate-900 shadow-lg print:shadow-none ${className}`}
    >
      {children}
    </div>
  );
}

/** 各ページ共通の小さなランニングヘッダー */
export function PrintRunningHeader({
  kind,
  testTitle,
  suffix,
}: {
  kind: "問題用紙" | "解答用紙";
  testTitle: string;
  suffix?: string;
}) {
  return (
    <div className="mb-4 border-b border-slate-300 pb-2 print:border-black">
      <p className="font-ja text-[10px] text-slate-500">
        {kind}
        {suffix ? ` · ${suffix}` : ""}
      </p>
      <p className="font-ja text-sm font-semibold text-slate-800">{testTitle}</p>
    </div>
  );
}
