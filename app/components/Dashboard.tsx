"use client"

import type { ChartData, DataProfile, DataBriefing } from '@/lib/types'
import ChartCard from './ChartCard'
import DataBriefingCard from './DataBriefingCard'

interface DashboardProps {
  charts: ChartData[]
  pinnedCharts: ChartData[]
  onUnpinChart: (chartId: string) => void
  profile?: DataProfile | null
  briefing?: DataBriefing | null
  onConfirmBriefing: (briefing: DataBriefing) => void
  onChartClick?: (event: { suggestedQuestion: string }) => void
}

export default function Dashboard({
  charts,
  pinnedCharts,
  onUnpinChart,
  profile,
  briefing,
  onConfirmBriefing,
  onChartClick,
}: DashboardProps) {
  const allCharts = [...pinnedCharts, ...charts]

  if (allCharts.length === 0 && !briefing) {
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
      {/* Data Briefing Card */}
      {briefing && (
        <div className="mb-4">
          <DataBriefingCard
            briefing={briefing}
            profile={profile ?? null}
            onConfirm={onConfirmBriefing}
          />
        </div>
      )}

      {/* Pinned Charts */}
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

      {/* Auto Analysis Charts */}
      {charts.length > 0 && (
        <section>
          <h2
            className="mb-3 text-sm font-medium uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}
          >
            Auto Analysis
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {charts.map((chart) => (
              <ChartCard
                key={chart.id}
                chart={chart}
                onChartClick={onChartClick}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
