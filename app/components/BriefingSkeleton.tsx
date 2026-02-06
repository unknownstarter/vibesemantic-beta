"use client"

export default function BriefingSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg p-4"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Title skeleton */}
      <div
        className="mb-4 h-5 w-1/3 rounded"
        style={{ background: 'var(--bg-tertiary)' }}
      />

      {/* Domain badge skeleton */}
      <div
        className="mb-4 inline-block h-6 w-24 rounded-full"
        style={{ background: 'var(--bg-tertiary)' }}
      />

      {/* Briefing text skeleton */}
      <div className="mb-4 space-y-2">
        <div
          className="h-3 w-full rounded"
          style={{ background: 'var(--bg-tertiary)' }}
        />
        <div
          className="h-3 w-5/6 rounded"
          style={{ background: 'var(--bg-tertiary)' }}
        />
        <div
          className="h-3 w-4/6 rounded"
          style={{ background: 'var(--bg-tertiary)' }}
        />
      </div>

      {/* Typing dots animation */}
      <div className="flex items-center gap-1">
        <span
          className="inline-block h-2 w-2 animate-bounce rounded-full"
          style={{
            background: 'var(--accent-muted)',
            animationDelay: '0ms',
          }}
        />
        <span
          className="inline-block h-2 w-2 animate-bounce rounded-full"
          style={{
            background: 'var(--accent-muted)',
            animationDelay: '150ms',
          }}
        />
        <span
          className="inline-block h-2 w-2 animate-bounce rounded-full"
          style={{
            background: 'var(--accent-muted)',
            animationDelay: '300ms',
          }}
        />
        <span
          className="ml-2 text-xs"
          style={{ color: 'var(--text-tertiary)' }}
        >
          데이터 분석 중...
        </span>
      </div>
    </div>
  )
}
