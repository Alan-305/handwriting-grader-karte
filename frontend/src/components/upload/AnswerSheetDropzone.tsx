import { useCallback, useId, useRef, useState } from "react";
import { FileImage, FileText, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ANSWER_SHEET_ACCEPT,
  filesFromDataTransfer,
  formatAnswerSheetFileLabel,
  isAcceptedAnswerSheetFile,
  isAnswerSheetImageFile,
  isAnswerSheetPdfFile,
  MAX_ANSWER_SHEET_PAGES,
  mergeAnswerSheetFiles,
} from "@/lib/answer-sheet-upload";
import { Button } from "@/components/ui/button";
import { confirmDelete } from "@/lib/confirm-delete";

export function AnswerSheetDropzone({
  files,
  onFilesChange,
  disabled,
  maxPages = MAX_ANSWER_SHEET_PAGES,
  hint,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
  maxPages?: number;
  hint?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rejectMessage, setRejectMessage] = useState<string | null>(null);

  const onlyImages = files.length > 0 && files.every(isAnswerSheetImageFile);
  const atCapacity = onlyImages && files.length >= maxPages;

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const list = Array.from(incoming);
      const accepted = list.filter(isAcceptedAnswerSheetFile);
      if (accepted.length === 0) {
        if (list.length > 0) {
          setRejectMessage("写真（JPEG/PNG 等）または PDF のみ追加できます。");
        }
        return;
      }
      if (accepted.length < list.length) {
        setRejectMessage("対応していない形式のファイルはスキップしました。");
      } else {
        setRejectMessage(null);
      }
      onFilesChange(mergeAnswerSheetFiles(files, accepted));
    },
    [files, onFilesChange],
  );

  const removeAt = (index: number) => {
    if (!confirmDelete(`${index + 1}件目の答案ファイルを削除します。よろしいですか？`)) return;
    setRejectMessage(null);
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const openFilePicker = () => {
    if (disabled || atCapacity) return;
    inputRef.current?.click();
  };

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors",
          dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white",
          disabled && "opacity-50",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) addFiles(filesFromDataTransfer(e.dataTransfer));
        }}
      >
        <Upload className="h-10 w-10 text-slate-400" aria-hidden />
        <p className="font-ja text-center text-base text-slate-600">
          手書き答案をドラッグ＆ドロップ
        </p>
        <p className="font-ja text-center text-sm text-slate-500">
          写真（JPEG/PNG 等）または PDF ・ 合計 {maxPages} ページまで
        </p>
        <p className="font-ja text-center text-xs text-slate-400">
          複数枚の場合は 1 枚目 → 2 枚目… の順で追加してください
        </p>
        {hint && <p className="font-ja text-center text-xs text-blue-800">{hint}</p>}

        <Button
          type="button"
          variant="outline"
          className="mt-1 min-h-11"
          disabled={disabled || atCapacity}
          onClick={openFilePicker}
        >
          ファイルを選択
        </Button>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ANSWER_SHEET_ACCEPT}
          multiple
          className="sr-only"
          disabled={disabled || atCapacity}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {rejectMessage && (
        <p className="font-ja text-sm text-amber-800" role="status">
          {rejectMessage}
        </p>
      )}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, index) => {
            const kind = formatAnswerSheetFileLabel(file);
            const Icon = kind === "PDF" ? FileText : FileImage;
            return (
              <li
                key={`${file.name}-${file.size}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3 font-ja text-sm">
                  <Icon className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                  <div className="min-w-0">
                    <span className="font-medium text-slate-800">
                      {index + 1}件目
                      <span className="ml-2 font-normal text-slate-500">（{kind}）</span>
                    </span>
                    <p className="truncate text-slate-500">{file.name}</p>
                    {kind === "PDF" && (
                      <p className="text-xs text-slate-400">
                        PDF のページ数は取り込み時にカウントされます
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 min-w-11 shrink-0"
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                  aria-label={`${index + 1}件目を削除`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {files.some(isAnswerSheetPdfFile) && (
        <p className="font-ja text-xs text-slate-500">
          PDF を含む場合、写真と合わせた総ページ数が {maxPages} ページを超えるとアップロードできません。
        </p>
      )}
    </div>
  );
}
