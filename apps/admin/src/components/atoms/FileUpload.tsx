"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, X, FileText, ImageIcon } from "lucide-react";
import { apiUpload, type UploadResult } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface FileUploadProps {
  label?: string;
  accept?: string;
  maxSizeMB?: number;
  value?: string | null;
  onUpload: (result: UploadResult) => void;
  onRemove?: () => void;
  prefix?: string;
  visibility?: "auto" | "public" | "private";
  error?: string;
  disabled?: boolean;
  previewType?: "image" | "document";
}

export function FileUpload({
  label,
  accept = "image/*",
  maxSizeMB = 10,
  value,
  onUpload,
  onRemove,
  prefix = "general",
  visibility = "auto",
  error,
  disabled = false,
  previewType = "image",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setUploadError(null);

      if (file.size > maxSizeMB * 1024 * 1024) {
        setUploadError(`File too large. Maximum size is ${maxSizeMB} MB.`);
        return;
      }

      try {
        setProgress(0);
        const result = await apiUpload(file, prefix, visibility, setProgress);
        onUpload(result);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setProgress(null);
      }
    },
    [maxSizeMB, prefix, visibility, onUpload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled || !e.dataTransfer.files[0]) return;
      handleFile(e.dataTransfer.files[0]);
    },
    [disabled, handleFile],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  const displayError = error || uploadError;

  // Show preview if value exists
  if (value) {
    return (
      <div>
        {label && <label className="input-label">{label}</label>}
        <div className="relative rounded-lg border border-black/10 overflow-hidden">
          {previewType === "image" ? (
            <img src={value.startsWith("/") ? `${process.env.NEXT_PUBLIC_API_URL || ""}${value}` : value} alt="Preview" className="w-full h-40 object-cover" />
          ) : (
            <div className="flex items-center gap-3 p-4 bg-zinc-50">
              <FileText className="h-8 w-8 text-darkAqua shrink-0" />
              <p className="text-sm text-zinc-600 truncate">{value.split("/").pop()}</p>
            </div>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="absolute top-2 right-2 w-7 h-7 rounded-md bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && <label className="input-label">{label}</label>}
      <div
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors",
          dragOver
            ? "border-darkAqua bg-darkAqua/5"
            : "border-black/15 hover:border-darkAqua/50",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        {progress !== null ? (
          <div className="w-full space-y-2">
            <p className="text-xs text-zinc-500 text-center">Uploading... {progress}%</p>
            <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-darkAqua rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            {previewType === "image" ? (
              <ImageIcon className="h-8 w-8 text-zinc-300" />
            ) : (
              <Upload className="h-8 w-8 text-zinc-300" />
            )}
            <p className="text-sm text-zinc-500">
              Drop file here or <span className="text-darkAqua font-medium">browse</span>
            </p>
            <p className="text-xs text-zinc-400">Max {maxSizeMB} MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onChange}
          className="hidden"
          disabled={disabled}
        />
      </div>
      {displayError && (
        <p className="text-xs text-red-500 mt-1">{displayError}</p>
      )}
    </div>
  );
}
