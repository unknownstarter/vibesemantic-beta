"use client"

import { useState, useEffect, useRef } from 'react'
import type { DataBriefing, DataProfile } from '@/lib/types'

interface DataBriefingCardProps {
  briefing: DataBriefing
  profile: DataProfile | null
  onConfirm: (briefing: DataBriefing) => void
}

export default function DataBriefingCard({
  briefing,
  profile,
  onConfirm,
}: DataBriefingCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [userContext, setUserContext] = useState('')
  const [isExpanded, setIsExpanded] = useState(!briefing.confirmed)
  const bodyRef = useRef<HTMLDivElement>(null)

  // 확인 시 800ms 후 자동 접기
  useEffect(() => {
    if (briefing.confirmed) {
      const timer = setTimeout(() => setIsExpanded(false), 800)
      return () => clearTimeout(timer)
    }
  }, [briefing.confirmed])

  const scoreColor = !profile ? 'var(--text-tertiary)'
    : profile.qualityScore >= 80 ? 'var(--success)'
    : profile.qualityScore >= 50 ? 'var(--warning)'
    : 'var(--error)'

  const handleConfirm = () => {
    onConfirm({ ...briefing, confirmed: true })
  }

  const handleCorrect = () => {
    if (!userContext.trim()) return
    onConfirm({
      ...briefing,
      domain: userContext.trim(),
      briefing: `${userContext.trim()} 데이터를 분석합니다.`,
      confirmed: true,
    })
    setIsEditing(false)
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      {/* 클릭 가능한 헤더 */}
      <button
        onClick={() => setIsExpanded(prev => !prev)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Data Briefing</h3>
          {briefing.domain && (
            <span className="text-xs" style={{ color: 'var(--accent-muted)' }}>
              {briefing.domain}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {profile && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-bold"
              style={{ color: scoreColor, border: `1px solid ${scoreColor}` }}
            >
              {profile.qualityScore}점
            </span>
          )}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="transition-transform duration-200"
            style={{
              color: 'var(--text-tertiary)',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* 접히는 본문 */}
      <div
        ref={bodyRef}
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: isExpanded ? '600px' : '0px' }}
      >
        <div className="px-5 pb-5 pt-0">
          {/* AI 추론 결과 */}
          <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {briefing.briefing}
          </p>

          {/* 도메인 관점 경고 */}
          {briefing.warnings.length > 0 && (
            <div className="mb-3 space-y-1">
              {briefing.warnings.map((w, i) => (
                <p key={i} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* 확인/수정 UI -- 미확인 시에만 표시 */}
          {!briefing.confirmed && (
            <div>
              {!isEditing ? (
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleConfirm() }}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                  >
                    맞아요
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsEditing(true) }}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    수정할게요
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={userContext}
                    onChange={(e) => setUserContext(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCorrect()}
                    placeholder="예: 알트타운 VTuber 가치 거래 플랫폼"
                    className="flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none"
                    style={{
                      background: 'var(--bg-tertiary)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)',
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCorrect() }}
                    disabled={!userContext.trim()}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-30"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                  >
                    확인
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
