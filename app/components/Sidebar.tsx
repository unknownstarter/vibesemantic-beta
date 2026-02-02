"use client";

import { useCallback, useRef, useState } from "react";
import type { UploadedFile, ChartData } from "../page";

interface SidebarProps {
  files: UploadedFile[];
  selectedFileIds: string[];
  onToggleFile: (fileId: string) => void;
  onFilesUploaded: (files: UploadedFile[], charts: ChartData[]) => void;
}

export default function Sidebar({
  files,
  selectedFileIds,
  onToggleFile,
  onFilesUploaded,
}: SidebarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (fileList: FileList) => {
      setIsUploading(true);
      try {
        const formData = new FormData();
        Array.from(fileList).forEach((file) => {
          formData.append("files", file);
        });

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("Upload failed");

        const json = await res.json();
        const payload = json.data || json;
        onFilesUploaded(payload.files, payload.charts || []);
      } catch (err) {
        console.error("Upload error:", err);
      } finally {
        setIsUploading(false);
      }
    },
    [onFilesUploaded]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files);
      }
    },
    [handleUpload]
  );

  return (
    <aside
      className="flex w-64 flex-col border-r"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-color)",
      }}
    >
      {/* Header */}
      <div className="border-b p-4" style={{ borderColor: "var(--border-color)" }}>
        <h1 className="text-lg font-bold" style={{ color: "var(--accent)" }}>
          VibeSemantic
        </h1>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          CSV Analysis Agent
        </p>
      </div>

      {/* Upload Area */}
      <div
        className={`m-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 ${
          isDragging ? "border-blue-400 bg-blue-400/10" : ""
        }`}
        style={{
          borderColor: isDragging ? "var(--accent)" : "var(--border-color)",
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
        />
        {isUploading ? (
          <div className="flex items-center gap-2">
            <div
              className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
            />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Uploading...
            </span>
          </div>
        ) : (
          <>
            <svg
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
              style={{ color: "var(--text-secondary)" }}
            >
              <path d="M12 16V4m0 0L8 8m4-4l4 4M4 20h16" />
            </svg>
            <span className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Drop CSV or click to upload
            </span>
          </>
        )}
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <p
          className="mb-2 text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          Data Files ({files.length})
        </p>
        {files.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            No files uploaded yet
          </p>
        ) : (
          <ul className="space-y-1">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white/5"
                onClick={() => onToggleFile(file.id)}
              >
                <div
                  className="h-3 w-3 rounded-sm border"
                  style={{
                    borderColor: selectedFileIds.includes(file.id)
                      ? "var(--accent)"
                      : "var(--border-color)",
                    background: selectedFileIds.includes(file.id)
                      ? "var(--accent)"
                      : "transparent",
                  }}
                />
                <span className="truncate" title={file.name}>
                  {file.name}
                </span>
                <span
                  className="ml-auto shrink-0 text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {file.rowCount.toLocaleString()}행
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
