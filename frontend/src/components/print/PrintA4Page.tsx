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

/** A4 1枚分の固定ページ（解答用紙などトンボ付きページ向け） */
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

/** 解答用紙：印刷時は各ページ四隅に固定表示されるトンボ */
export function PrintFixedCornerMarks() {
  const corners = [
    "print-corner-tl",
    "print-corner-tr",
    "print-corner-bl",
    "print-corner-br",
  ] as const;

  return (
    <>
      {corners.map((corner) => (
        <div
          key={corner}
          aria-hidden
          className={`print-corner-mark ${corner} border border-slate-800 print:border-black`}
        />
      ))}
    </>
  );
}

/** 解答用紙四隅のトンボ（固定ページコンテナ内） */
export function PrintCornerMarks() {
  return (
    <>
      {[
        { top: 4, left: 4 },
        { top: 4, right: 4 },
        { bottom: 4, left: 4 },
        { bottom: 4, right: 4 },
      ].map((pos, i) => (
        <div
          key={i}
          className="absolute h-3 w-3 border border-slate-800 print:border-black"
          style={pos}
        />
      ))}
    </>
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
