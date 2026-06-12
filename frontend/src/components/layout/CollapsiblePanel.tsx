import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function CollapsiblePanel({
  title,
  description,
  children,
  defaultOpen = true,
  storageKey,
  className,
  headerActions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** 指定時は開閉状態を localStorage に保存 */
  storageKey?: string;
  className?: string;
  /** ヘッダー右側のアクション（クリックしても折りたたみは切り替わらない） */
  headerActions?: ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const raw = localStorage.getItem(`collapsible:${storageKey}`);
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch {
      /* ignore */
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(`collapsible:${storageKey}`, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open, storageKey]);

  return (
    <Card className={cn("no-print border-slate-200", className)}>
      <div className="flex items-start gap-2 p-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left transition-colors hover:opacity-80"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <div className="min-w-0 flex-1">
            <CardTitle className="font-ja text-lg">{title}</CardTitle>
            {description && open ? (
              <CardDescription className="mt-1 font-ja">{description}</CardDescription>
            ) : null}
            {!open ? (
              <p className="mt-2 font-ja text-xs text-slate-500">クリックで展開</p>
            ) : null}
          </div>
          <ChevronDown
            className={cn(
              "mt-1 h-5 w-5 shrink-0 text-slate-500 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        {headerActions ? (
          <div
            className="flex shrink-0 flex-wrap items-center gap-1"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {headerActions}
          </div>
        ) : null}
      </div>
      {open ? (
        <div className="border-t border-slate-100 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">{children}</div>
      ) : null}
    </Card>
  );
}
