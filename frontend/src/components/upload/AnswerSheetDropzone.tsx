import { useCallback, useState } from "react";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MAX_PAGES = 4;

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

export function AnswerSheetDropzone({
  files,
  onFilesChange,
  disabled,
  maxPages = MAX_PAGES,
  hint,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
  maxPages?: number;
  hint?: string;
}) {
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const list = Array.from(incoming).filter(isImageFile);
      if (list.length === 0) return;
      onFilesChange([...files, ...list].slice(0, maxPages));
    },
    [files, maxPages, onFilesChange],
  );

  const removeAt = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <label
        className={cn(
          "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors",
          dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white hover:border-blue-400",
          (disabled || files.length >= maxPages) && "pointer-events-none opacity-50",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="h-10 w-10 text-slate-400" />
        <p className="font-ja text-base text-slate-600">手書き答案をドラッグ＆ドロップ</p>
        <p className="font-ja text-sm text-slate-400">
          またはクリックして選択（{maxPages}枚まで・順番に並べてください）
        </p>
        {hint && <p className="font-ja text-xs text-blue-800">{hint}</p>}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={disabled || files.length >= maxPages}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
            >
              <div className="font-ja text-sm">
                <span className="font-medium text-slate-800">{index + 1}枚目</span>
                <span className="ml-2 text-slate-500">{file.name}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 min-w-11"
                disabled={disabled}
                onClick={() => removeAt(index)}
                aria-label={`${index + 1}枚目を削除`}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
