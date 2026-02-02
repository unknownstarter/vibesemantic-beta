"use client"

import { useState } from 'react'
import type { ChartData, DataProfile } from '@/lib/types'
import ChartCard from './ChartCard'
import ProfileCard from './ProfileCard'
import DataTable from './DataTable'

interface DashboardProps {
  charts: ChartData[]
  pinnedCharts: ChartData[]
  onUnpinChart: (chartId: string) => void
  profile?: DataProfile | null
  sampleData?: Record<string, unknown>[]
  sampleColumns?: string[]
  onChartClick?: (event: { suggestedQuestion: string }) => void
}

export default function Dashboard({
  charts,
  pinnedCharts,
  onUnpinChart,
  profile,
  sampleData,
  sampleColumns,
  onChartClick,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'charts' | 'data'>('charts')
  const allCharts = [...pinnedCharts, ...charts]
  const hasData = sampleData && sampleData.length > 0 && sampleColumns && sampleColumns.length > 0

  if (allCharts.length === 0 && !profile) {
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
      {/* Profile Card */}
      {profile && profile.qualityScore >= 0 && (
        <div className="mb-4">
          <ProfileCard profile={profile} />
        </div>
      )}

      {/* Tabs */}
      {hasData && (
        <div className="mb-4 flex gap-1">
          <button
            onClick={() => setActiveTab('charts')}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{
              background: activeTab === 'charts' ? 'var(--bg-tertiary)' : 'transparent',
              color: activeTab === 'charts' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
          >
            Charts
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{
              background: activeTab === 'data' ? 'var(--bg-tertiary)' : 'transparent',
              color: activeTab === 'data' ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
          >
            Data
          </button>
        </div>
      )}

      {/* Data Table Tab */}
      {activeTab === 'data' && hasData && (
        <DataTable
          data={sampleData!}
          columns={sampleColumns!}
          onRowClick={(row) => {
            const firstCol = sampleColumns![0]
            onChartClick?.({
              suggestedQuestion: `"${String(row[firstCol])}" 행을 더 자세히 분석해줘`,
            })
          }}
        />
      )}

      {/* Charts Tab */}
      {activeTab === 'charts' && (
        <>
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
        </>
      )}
    </div>
  )
}
