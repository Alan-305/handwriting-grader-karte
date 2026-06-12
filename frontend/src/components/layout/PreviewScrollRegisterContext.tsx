import { createContext, useCallback, useContext, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

const PreviewScrollRegisterContext = createContext<((el: HTMLElement | null) => void) | null>(
  null,
);

export function PreviewScrollRegisterProvider({
  onRegister,
  children,
}: {
  onRegister: (el: HTMLElement | null) => void;
  children: ReactNode;
}) {
  return (
    <PreviewScrollRegisterContext.Provider value={onRegister}>
      {children}
    </PreviewScrollRegisterContext.Provider>
  );
}

function usePreviewScrollRegister() {
  return useContext(PreviewScrollRegisterContext);
}

/** 右プレビューのスクロール領域（SyncPreviewSplit 配下でのみ register が効く） */
export function PreviewScrollArea({
  scrollRef,
  className,
  children,
}: {
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
}) {
  const register = usePreviewScrollRegister();

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      register?.(node);
      if (scrollRef) {
        scrollRef.current = node;
      }
    },
    [register, scrollRef],
  );

  return (
    <div
      ref={setRef}
      className={cn(
        "min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-y-contain",
        className,
      )}
    >
      {children}
    </div>
  );
}
