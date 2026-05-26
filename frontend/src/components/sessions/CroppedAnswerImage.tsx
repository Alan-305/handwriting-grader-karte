import { useEffect, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { getStorageInstance } from "@/lib/firebase";
import { cn } from "@/lib/utils";

export function CroppedAnswerImage({
  storagePath,
  alt,
  className,
}: {
  storagePath: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(false);
    getDownloadURL(ref(getStorageInstance(), storagePath))
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  if (error) {
    return (
      <div
        className={cn(
          "flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 font-ja text-sm text-slate-500",
          className,
        )}
      >
        画像を読み込めませんでした
      </div>
    );
  }

  if (!url) {
    return (
      <div
        className={cn(
          "min-h-[120px] animate-pulse rounded-lg bg-slate-100",
          className,
        )}
      />
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={cn(
        "max-h-64 w-full rounded-lg border border-slate-200 object-contain bg-white",
        className,
      )}
    />
  );
}
