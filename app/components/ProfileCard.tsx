"use client"

import type { DataProfile } from '@/lib/types'

interface ProfileCardProps {
  profile: DataProfile
}

export default function ProfileCard({ profile }: ProfileCardProps) {
  if (profile.qualityScore < 0) return null

  const scoreColor = profile.qualityScore >= 80 ? 'var(--success)'
    : profile.qualityScore >= 50 ? 'var(--warning)'
    : 'var(--error)'

  const highWarnings = profile.warnings.filter(w => w.severity === 'high')
  const medWarnings = profile.warnings.filter(w => w.severity === 'medium')

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Smart Profile</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {profile.totalRows.toLocaleString()}행
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-bold"
            style={{ color: scoreColor, border: `1px solid ${scoreColor}` }}
          >
            {profile.qualityScore}점
          </span>
        </div>
      </div>

      {/* Warnings */}
      {profile.warnings.length > 0 && (
        <div className="mb-3 space-y-1">
          {highWarnings.map((w, i) => (
            <div key={`h-${i}`} className="flex items-start gap-2 text-xs">
              <span style={{ color: 'var(--error)' }}>●</span>
              <span>
                <strong>{w.column}</strong>: {w.detail}
              </span>
            </div>
          ))}
          {medWarnings.map((w, i) => (
            <div key={`m-${i}`} className="flex items-start gap-2 text-xs">
              <span style={{ color: 'var(--warning)' }}>●</span>
              <span>
                <strong>{w.column}</strong>: {w.detail}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Correlations */}
      {profile.correlations.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            주요 상관관계
          </p>
          <div className="flex flex-wrap gap-1">
            {profile.correlations.slice(0, 3).map((c, i) => (
              <span
                key={i}
                className="rounded-md px-2 py-0.5 text-xs"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
                {c.col1} ↔ {c.col2} ({c.coefficient > 0 ? '+' : ''}{c.coefficient})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Distributions summary */}
      {profile.distributions.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            분포 요약
          </p>
          <div className="grid grid-cols-2 gap-1">
            {profile.distributions.slice(0, 4).map((d, i) => (
              <div key={i} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {d.column}: μ={d.mean}, σ={d.std}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
