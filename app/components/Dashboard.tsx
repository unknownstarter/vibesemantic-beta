"use client"

import { useState, useMemo } from 'react'
import type { ChartData, DataProfile, DataBriefing } from '@/lib/types'
import ChartCard from './ChartCard'
import DataBriefingCard from './DataBriefingCard'

interface DashboardProps {
  charts: ChartData[]
  pinnedCharts: ChartData[]
  onUnpinChart: (chartId: string) => void
  profile?: DataProfile | null
  briefings?: DataBriefing[]
  onConfirmBriefing: (briefing: DataBriefing) => void
  onChartClick?: (event: { suggestedQuestion: string }) => void
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
}: DashboardProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

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

  if (allEmpty) {
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
      {/* Data Briefing Cards — 새 브리핑이 위에 오도록 역순 표시 */}
      {briefings.length > 0 && (
        <div className="mb-4 space-y-3">
          {[...briefings].reverse().map((b, i) => (
            <DataBriefingCard
              key={`briefing-${briefings.length - 1 - i}`}
              briefing={b}
              profile={i === 0 ? (profile ?? null) : null}
              onConfirm={onConfirmBriefing}
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
    </div>
  )
}
