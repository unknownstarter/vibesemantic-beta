"use client"

import { useState } from 'react'
import type { ActionRecommendation } from '@/lib/types'

interface ActionCardProps {
  recommendations: ActionRecommendation[]
  onActionClick?: (action: ActionRecommendation) => void
}

const impactColors = {
  high: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', label: '높음' },
  medium: { bg: 'rgba(251, 191, 36, 0.15)', text: '#fbbf24', label: '중간' },
  low: { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8', label: '낮음' },
}

const effortColors = {
  low: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', label: '쉬움' },
  medium: { bg: 'rgba(251, 191, 36, 0.15)', text: '#fbbf24', label: '보통' },
  high: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: '어려움' },
}

export default function ActionCard({ recommendations, onActionClick }: ActionCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!recommendations || recommendations.length === 0) return null

  // Sort by impact (high first) then by effort (low first)
  const sorted = [...recommendations].sort((a, b) => {
    const impactOrder = { high: 0, medium: 1, low: 2 }
    const effortOrder = { low: 0, medium: 1, high: 2 }
    const impactDiff = impactOrder[a.impact] - impactOrder[b.impact]
    if (impactDiff !== 0) return impactDiff
    return effortOrder[a.effort] - effortOrder[b.effort]
  })

  return (
    <div
      className="mb-4 overflow-hidden rounded-xl"
      style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: '1px solid rgba(59, 130, 246, 0.2)' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          추천 액션
        </h3>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}
        >
          {recommendations.length}개 발견
        </span>
      </div>

      {/* Action List */}
      <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        {sorted.map((action, index) => {
          const isExpanded = expandedId === action.id
          const impact = impactColors[action.impact]
          const effort = effortColors[action.effort]

          return (
            <div
              key={action.id}
              className="group cursor-pointer transition-colors hover:bg-white/5"
              onClick={() => setExpandedId(isExpanded ? null : action.id)}
            >
              {/* Main Row */}
              <div className="flex items-start gap-3 px-4 py-3">
                {/* Priority Number */}
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: index === 0 ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.1)',
                    color: index === 0 ? '#60a5fa' : 'var(--text-secondary)',
                  }}
                >
                  {index + 1}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  {/* Action Title */}
                  <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
                    {action.action}
                  </p>

                  {/* Expected Outcome */}
                  <p className="mt-1 text-sm" style={{ color: '#22c55e' }}>
                    → {action.expectedOutcome}
                  </p>

                  {/* Tags */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{ background: impact.bg, color: impact.text }}
                    >
                      영향도: {impact.label}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{ background: effort.bg, color: effort.text }}
                    >
                      난이도: {effort.label}
                    </span>
                    {action.metric && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}
                      >
                        {action.metric}: {action.currentValue} → {action.targetValue}
                      </span>
                    )}
                  </div>

                  {/* Expanded: Reasoning */}
                  {isExpanded && (
                    <div
                      className="mt-3 rounded-lg p-3 text-xs leading-relaxed"
                      style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-secondary)' }}
                    >
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>근거: </span>
                      {action.reasoning}
                    </div>
                  )}
                </div>

                {/* Expand Icon */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="shrink-0 transition-transform"
                  style={{
                    color: 'var(--text-tertiary)',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>

              {/* Action Button (shown on hover or when expanded) */}
              {(isExpanded || index === 0) && onActionClick && (
                <div className="px-4 pb-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onActionClick(action)
                    }}
                    className="w-full rounded-lg py-2 text-sm font-medium transition-colors hover:opacity-90"
                    style={{
                      background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                      color: 'white',
                    }}
                  >
                    이 액션 상세 분석하기
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
