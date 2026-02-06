"use client"

interface ChartSkeletonProps {
  count?: number
}

export default function ChartSkeleton({ count = 3 }: ChartSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg p-4"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {/* Title skeleton */}
          <div
            className="mb-4 h-4 w-3/4 rounded"
            style={{ background: 'var(--bg-tertiary)' }}
          />

          {/* Chart area skeleton */}
          <div
            className="mb-3 h-48 rounded"
            style={{ background: 'var(--bg-tertiary)' }}
          />

          {/* Insight skeleton lines */}
          <div className="space-y-2">
            <div
              className="h-3 w-full rounded"
              style={{ background: 'var(--bg-tertiary)' }}
            />
            <div
              className="h-3 w-2/3 rounded"
              style={{ background: 'var(--bg-tertiary)' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
