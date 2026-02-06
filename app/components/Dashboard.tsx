"use client"

import { useState, useMemo } from 'react'
import type { ChartData, DataProfile, DataBriefing, ActionRecommendation } from '@/lib/types'
import ChartCard from './ChartCard'
import DataBriefingCard from './DataBriefingCard'
import ChartSkeleton from './ChartSkeleton'
import BriefingSkeleton from './BriefingSkeleton'
import ActionCard from './ActionCard'

interface DashboardProps {
  charts: ChartData[]
  pinnedCharts: ChartData[]
  onUnpinChart: (chartId: string) => void
  profile?: DataProfile | null
  briefings?: DataBriefing[]
  onConfirmBriefing: (briefing: DataBriefing) => void
  onChartClick?: (event: { suggestedQuestion: string }) => void
  onActionClick?: (action: ActionRecommendation) => void
  isLoading?: boolean
  loadingMessage?: string
}

interface SourceGroup {
  source: string
  charts: ChartData[]
}

export default function Dashboard({
  charts,
  pinnedCharts,
  onUnpinChart,
  profile,
  briefings = [],
  onConfirmBriefing,
  onChartClick,
  onActionClick,
  isLoading = false,
  loadingMessage,
}: DashboardProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Collect all action recommendations from briefings
  const allActionRecommendations = useMemo(() => {
    return briefings.flatMap(b => b.actionRecommendations ?? [])
  }, [briefings])

  // 차트를 데이터 소스별로 그룹핑
  const sourceGroups = useMemo<SourceGroup[]>(() => {
    const groupMap = new Map<string, ChartData[]>()
    for (const chart of charts) {
      const source = chart.source ?? 'Auto Analysis'
      if (!groupMap.has(source)) groupMap.set(source, [])
      groupMap.get(source)!.push(chart)
    }

    const groups: SourceGroup[] = []
    // 교차 분석 그룹은 마지막에
    for (const [source, groupCharts] of groupMap) {
      if (!source.includes('교차') && !source.includes('cross')) {
        groups.push({ source, charts: groupCharts })
      }
    }
    // 교차 분석 그룹 추가
    for (const [source, groupCharts] of groupMap) {
      if (source.includes('교차') || source.includes('cross')) {
        groups.push({ source, charts: groupCharts })
      }
    }
    return groups
  }, [charts])

  const toggleGroup = (source: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(source)) {
        next.delete(source)
      } else {
        next.add(source)
      }
      return next
    })
  }

  const allEmpty = charts.length === 0 && pinnedCharts.length === 0 && briefings.length === 0

  // Empty state (no loading, no data)
  if (!isLoading && allEmpty) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-6 text-5xl font-extralight opacity-10">V</div>
          <h2 className="mb-2 text-lg font-medium tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Upload your data
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Drag CSV files to the sidebar to auto-generate a dashboard
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Loading Progress Banner */}
      {isLoading && (
        <div
          className="mb-4 flex items-center gap-3 rounded-lg p-3"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 animate-bounce rounded-full"
              style={{ background: 'var(--accent)', animationDelay: '0ms' }}
            />
            <span
              className="inline-block h-2 w-2 animate-bounce rounded-full"
              style={{ background: 'var(--accent)', animationDelay: '150ms' }}
            />
            <span
              className="inline-block h-2 w-2 animate-bounce rounded-full"
              style={{ background: 'var(--accent)', animationDelay: '300ms' }}
            />
          </div>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {loadingMessage || '분석 중...'}
          </span>
          {charts.length > 0 && (
            <span
              className="ml-auto rounded-full px-2 py-0.5 text-xs"
              style={{ background: 'var(--accent-muted)', color: 'var(--text-primary)' }}
            >
              {charts.length}개 차트 생성됨
            </span>
          )}
        </div>
      )}

      {/* 🔥 Action Recommendations — 가장 눈에 띄는 위치 (맨 위) */}
      {allActionRecommendations.length > 0 && (
        <ActionCard
          recommendations={allActionRecommendations}
          onActionClick={onActionClick}
        />
      )}

      {/* Briefing skeleton when loading and no briefing yet */}
      {isLoading && briefings.length === 0 && (
        <div className="mb-4">
          <BriefingSkeleton />
        </div>
      )}

      {/* Data Briefing Cards — 최신 브리핑만 펼침, 나머지는 접힘 */}
      {briefings.length > 0 && (
        <div className="mb-4 space-y-2">
          {[...briefings].reverse().map((b, i) => (
            <DataBriefingCard
              key={`briefing-${briefings.length - 1 - i}`}
              briefing={b}
              profile={i === 0 ? (profile ?? null) : null}
              onConfirm={onConfirmBriefing}
              defaultCollapsed={i > 0}
            />
          ))}
        </div>
      )}

      {/* Pinned Charts (from chat analysis) */}
      {pinnedCharts.length > 0 && (
        <section className="mb-6">
          <h2
            className="mb-3 text-xs font-medium uppercase tracking-widest"
            style={{ color: 'var(--accent-muted)' }}
          >
            Pinned
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pinnedCharts.map((chart) => (
              <ChartCard
                key={chart.id}
                chart={chart}
                pinned
                onUnpin={() => onUnpinChart(chart.id)}
                onChartClick={onChartClick}
              />
            ))}
          </div>
        </section>
      )}

      {/* Source-grouped Charts */}
      {sourceGroups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.source)
        // 소스 이름에서 파일명만 추출 (display용)
        const displayName = group.source

        return (
          <section key={group.source} className="mb-5">
            <button
              onClick={() => toggleGroup(group.source)}
              className="mb-3 flex w-full items-center gap-2 text-left"
            >
              <svg
                width="12" height="12" viewBox="0 0 12 12" fill="none"
                className="shrink-0 transition-transform"
                style={{
                  color: 'var(--text-secondary)',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                }}
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                {displayName}
              </span>
              <span
                className="text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                ({group.charts.length})
              </span>
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {group.charts.map((chart) => (
                  <ChartCard
                    key={chart.id}
                    chart={chart}
                    onChartClick={onChartClick}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}

      {/* Chart skeletons while loading (show remaining placeholders) */}
      {isLoading && charts.length < 6 && (
        <section className="mb-5">
          <div
            className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: 'var(--accent)' }}
            />
            생성 중...
          </div>
          <ChartSkeleton count={Math.max(2, 6 - charts.length)} />
        </section>
      )}
    </div>
  )
}
