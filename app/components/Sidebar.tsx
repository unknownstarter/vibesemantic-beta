"use client"

import { useCallback, useRef, useState } from 'react'
import type { ChartData, QuickAction, DataProfile, FileMetadata, UploadedFile, DataBriefing } from '@/lib/types'
import QuickActions from './QuickActions'
import type { UploadStatus } from '@/app/hooks/useUploadStream'

interface SidebarProps {
  files: UploadedFile[]
  selectedFileIds: string[]
  sessionId: string | null
  onToggleFile: (fileId: string) => void
  onFilesUploaded: (
    sessionId: string,
    files: FileMetadata[],
    charts: ChartData[],
    profile?: DataProfile,
    quickActions?: QuickAction[],
    briefing?: DataBriefing,
  ) => void
  quickActions: QuickAction[]
  onQuickAction: (prompt: string) => void
  onToggleDataTable: () => void
  showDataTable: boolean
  // Streaming upload props
  uploadStatus?: UploadStatus
  uploadMessage?: string
  onUploadStart?: (files: FileList) => void
}

export default function Sidebar({
  files,
  selectedFileIds,
  sessionId,
  onToggleFile,
  onFilesUploaded,
  quickActions,
  onQuickAction,
  onToggleDataTable,
  showDataTable,
  uploadStatus,
  uploadMessage,
  onUploadStart,
}: SidebarProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Use streaming upload if available
  const isStreamingUpload = !!onUploadStart
  const isCurrentlyUploading = isStreamingUpload
    ? (uploadStatus !== 'idle' && uploadStatus !== 'complete' && uploadStatus !== 'error')
    : isUploading

  const handleUpload = useCallback(
    async (fileList: FileList) => {
      // Use streaming upload if available
      if (onUploadStart) {
        onUploadStart(fileList)
        return
      }

      // Legacy upload path
      setIsUploading(true)
      try {
        const formData = new FormData()
        Array.from(fileList).forEach((file) => {
          formData.append('files', file)
        })
        if (sessionId) {
          formData.append('sessionId', sessionId)
        }

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) throw new Error('Upload failed')

        const json = await res.json()
        const payload = json.data || json
        // profiles 배열에서 첫 번째 유효 프로파일 추출 (멀티 섹션 대응)
        const firstProfile = Array.isArray(payload.profiles)
          ? payload.profiles[0]
          : payload.profile
        onFilesUploaded(
          payload.sessionId,
          payload.files,
          payload.charts || [],
          firstProfile,
          payload.quickActions,
          payload.briefing,
        )
      } catch (err) {
        console.error('Upload error:', err)
      } finally {
        setIsUploading(false)
      }
    },
    [onFilesUploaded, sessionId, onUploadStart]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files)
      }
    },
    [handleUpload]
  )

  return (
    <aside
      className="flex w-64 flex-col border-r"
      style={{
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border-color)',
      }}
    >
      {/* Header */}
      <div className="border-b p-4" style={{ borderColor: 'var(--border-color)' }}>
        <h1 className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
          VibeSemantic
        </h1>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          CSV Analysis Agent
        </p>
      </div>

      {/* Upload Area */}
      <label
        htmlFor="csv-upload"
        className={`m-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 ${
          isDragging ? 'border-blue-400 bg-blue-400/10' : ''
        }`}
        style={{
          borderColor: isDragging ? 'var(--accent)' : 'var(--border-color)',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          id="csv-upload"
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          className="sr-only"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
        />
        {isCurrentlyUploading ? (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <div
                className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
              />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {uploadMessage || 'Uploading...'}
              </span>
            </div>
            {uploadStatus && uploadStatus !== 'uploading' && (
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {uploadStatus === 'parsing' && '파일 분석 중...'}
                {uploadStatus === 'profiling' && '프로파일링...'}
                {uploadStatus === 'briefing' && '브리핑 생성 중...'}
                {uploadStatus === 'charts' && '차트 생성 중...'}
              </span>
            )}
          </div>
        ) : (
          <>
            <svg
              width="24" height="24" fill="none" stroke="currentColor"
              strokeWidth="1.5" viewBox="0 0 24 24"
              style={{ color: 'var(--text-secondary)' }}
            >
              <path d="M12 16V4m0 0L8 8m4-4l4 4M4 20h16" />
            </svg>
            <span className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Drop CSV or click to upload
            </span>
          </>
        )}
      </label>
      <p
        className="mx-3 -mt-1 mb-1 text-center text-[10px] leading-tight"
        style={{ color: 'var(--text-tertiary)' }}
      >
        여러 테이블이 있는 파일도 자동 감지합니다.
        테이블별로 분리하면 더 정확한 분석이 가능합니다.
      </p>

      {/* File List + Quick Actions (scrollable together) */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <p
          className="mb-2 text-xs font-medium uppercase tracking-wider"
          style={{ color: 'var(--text-secondary)' }}
        >
          Data Files ({files.length})
        </p>
        {files.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
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
                      ? 'var(--accent)'
                      : 'var(--border-color)',
                    background: selectedFileIds.includes(file.id)
                      ? 'var(--accent)'
                      : 'transparent',
                  }}
                />
                <span className="truncate" title={file.name}>
                  {file.name}
                </span>
                <span
                  className="ml-auto shrink-0 text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {file.rowCount.toLocaleString()}행
                </span>
              </li>
            ))}
          </ul>
        )}
        {files.length > 0 && (
          <button
            onClick={onToggleDataTable}
            className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-white/5"
            style={{ color: showDataTable ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M3 10h18M3 14h18M3 6h18M3 18h18" />
            </svg>
            {showDataTable ? '원본 숨기기' : '원본 보기'}
          </button>
        )}

        {/* Quick Actions (inside scroll area) */}
        {quickActions.length > 0 && (
          <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border-color)' }}>
            <QuickActions actions={quickActions} onAction={onQuickAction} />
          </div>
        )}
      </div>
    </aside>
  )
}
