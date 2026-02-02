"use client"

import { useState } from 'react'
import type { ChatMessage, ExportFormat } from '@/lib/types'

interface ExportButtonProps {
  messages: ChatMessage[]
  sessionTitle?: string
}

export default function ExportButton({ messages, sessionTitle }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleExport = async (format: ExportFormat) => {
    setIsOpen(false)

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          sessionTitle: sessionTitle ?? 'VibeSemantic Analysis',
          format,
        }),
      })

      if (!res.ok) throw new Error('Export failed')

      const blob = await res.blob()
      const ext = format === 'notebook' ? 'ipynb' : 'py'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `analysis.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export error:', err)
    }
  }

  if (messages.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-md px-2 py-1 text-xs hover:bg-white/5"
        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
      >
        Export
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full right-0 mb-1 rounded-lg border py-1 shadow-lg"
          style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}
        >
          <button
            onClick={() => handleExport('python')}
            className="w-full px-4 py-1.5 text-left text-xs hover:bg-white/5"
            style={{ color: 'var(--text-primary)' }}
          >
            .py (Python Script)
          </button>
          <button
            onClick={() => handleExport('notebook')}
            className="w-full px-4 py-1.5 text-left text-xs hover:bg-white/5"
            style={{ color: 'var(--text-primary)' }}
          >
            .ipynb (Jupyter Notebook)
          </button>
        </div>
      )}
    </div>
  )
}
