"use client"

import { useEffect, useRef, useCallback } from 'react'

interface ImageModalProps {
  src: string
  alt: string
  open: boolean
  onClose: () => void
}

export default function ImageModal({ src, alt, open, onClose }: ImageModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose()
  }, [onClose])

  const handleDownload = useCallback(() => {
    const a = document.createElement('a')
    a.href = src
    a.download = alt || 'chart.png'
    a.click()
  }, [src, alt])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onClose={onClose}
      className="fixed inset-0 z-50 m-0 h-screen w-screen max-h-none max-w-none bg-transparent p-0"
      style={{ backgroundColor: 'transparent' }}
    >
      <div className="flex h-full w-full items-center justify-center bg-black/80 p-8">
        <div className="relative max-h-[90vh] max-w-[90vw]">
          <div className="absolute -top-10 right-0 flex gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs hover:bg-white/10"
              style={{ color: 'var(--text-secondary)' }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Download
            </button>
            <button
              onClick={onClose}
              className="rounded-md px-2 py-1.5 text-xs hover:bg-white/10"
              style={{ color: 'var(--text-secondary)' }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <img
            src={src}
            alt={alt}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      </div>
    </dialog>
  )
}
