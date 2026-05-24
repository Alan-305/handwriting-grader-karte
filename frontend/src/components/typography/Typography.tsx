import { cn } from "@/lib/utils";

export function EnText({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("font-en", className)} {...props} />;
}

export function JaText({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("font-ja", className)} {...props} />;
}

export function FeedbackBlock({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <h4 className="font-ja text-sm font-semibold text-slate-700">{title}</h4>
      <div className="text-feedback font-ja text-slate-800">{children}</div>
    </div>
  );
}
