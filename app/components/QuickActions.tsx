"use client"

import type { QuickAction } from '@/lib/types'

interface QuickActionsProps {
  actions: QuickAction[]
  onAction: (prompt: string) => void
}

const ICON_MAP: Record<string, string> = {
  timeline: '📈',
  group: '📊',
  scatter: '🔗',
  missing: '❓',
  text: '📝',
  outlier: '⚠️',
}

export default function QuickActions({ actions, onAction }: QuickActionsProps) {
  if (actions.length === 0) return null

  return (
    <div className="border-t px-3 py-3" style={{ borderColor: 'var(--border-color)' }}>
      <p
        className="mb-2 text-xs font-medium uppercase tracking-wider"
        style={{ color: 'var(--text-secondary)' }}
      >
        Quick Actions
      </p>
      <div className="space-y-1">
        {actions.map(action => (
          <button
            key={action.id}
            onClick={() => onAction(action.prompt)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/5"
            title={action.description}
          >
            <span>{ICON_MAP[action.icon] ?? '🔍'}</span>
            <span className="truncate">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
