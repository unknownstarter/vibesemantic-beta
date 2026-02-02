"use client"

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import type { ChartData } from '@/lib/types'

const COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee', '#e879f9']

interface ChartCardProps {
  chart: ChartData
  pinned?: boolean
  onPin?: () => void
  onUnpin?: () => void
  onChartClick?: (event: { chartId: string; chartType: string; clickedValue: string | number; clickedKey: string; suggestedQuestion: string }) => void
}

function generateClickQuestion(
  data: Record<string, unknown>,
  chartType: string,
  xKey: string,
): string {
  const key = String(data[xKey] ?? '')
  if (chartType === 'bar' || chartType === 'pie') {
    return `"${key}" 항목을 더 자세히 분석해줘`
  }
  if (chartType === 'line') {
    return `${key} 시점의 변화 원인을 분석해줘`
  }
  if (chartType === 'histogram') {
    return `이 구간에 속하는 데이터를 분석해줘`
  }
  return `이 데이터 포인트를 분석해줘`
}

export default function ChartCard({ chart, pinned, onPin, onUnpin, onChartClick }: ChartCardProps) {
  const xKey = chart.xKey || 'name'
  const yKey = chart.yKey || 'value'

  const handleClick = (data: Record<string, unknown>) => {
    if (!onChartClick) return
    const question = generateClickQuestion(data, chart.type, xKey)
    onChartClick({
      chartId: chart.id,
      chartType: chart.type,
      clickedValue: data[yKey] as string | number,
      clickedKey: String(data[xKey] ?? ''),
      suggestedQuestion: question,
    })
  }

  const renderChart = () => {
    if (chart.imageUrl) {
      return (
        <img
          src={chart.imageUrl}
          alt={chart.title}
          className="h-64 w-full object-contain"
        />
      )
    }

    if (chart.type === 'summary') {
      return (
        <div className="grid grid-cols-2 gap-3 p-4">
          {chart.data.map((item, i) => (
            <div
              key={i}
              className="rounded-lg p-3"
              style={{ background: 'var(--bg-primary)' }}
            >
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {String(item.label || item.name || '')}
              </p>
              <p className="text-lg font-bold" style={{ color: COLORS[i % COLORS.length] }}>
                {String(item.value || '')}
              </p>
            </div>
          ))}
        </div>
      )
    }

    if (chart.type === 'bar' || chart.type === 'histogram') {
      return (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chart.data} onClick={(e: Record<string, unknown> | null) => {
            const payload = (e as { activePayload?: Array<{ payload: Record<string, unknown> }> })?.activePayload?.[0]
            if (payload) handleClick(payload.payload)
          }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey={xKey} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
              }}
            />
            <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
              {chart.data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} cursor="pointer" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )
    }

    if (chart.type === 'line') {
      return (
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chart.data} onClick={(e: Record<string, unknown> | null) => {
            const payload = (e as { activePayload?: Array<{ payload: Record<string, unknown> }> })?.activePayload?.[0]
            if (payload) handleClick(payload.payload)
          }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
            <XAxis dataKey={xKey} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
              }}
            />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke={COLORS[0]}
              strokeWidth={2}
              dot={{ fill: COLORS[0], cursor: 'pointer' }}
            />
          </LineChart>
        </ResponsiveContainer>
      )
    }

    if (chart.type === 'pie') {
      return (
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={chart.data}
              dataKey={yKey}
              nameKey={xKey}
              cx="50%"
              cy="50%"
              outerRadius={80}
              onClick={(_, idx) => handleClick(chart.data[idx])}
              label={(props) => {
                const name = String(props.name ?? '')
                const percent = Number(props.percent ?? 0)
                return `${name} ${(percent * 100).toFixed(0)}%`
              }}
            >
              {chart.data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} cursor="pointer" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      )
    }

    return null
  }

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{
        background: 'var(--bg-card)',
        borderColor: pinned ? 'var(--accent-muted)' : 'var(--border-color)',
      }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <h3 className="text-sm font-medium">{chart.title}</h3>
        <div className="flex gap-1">
          {pinned && onUnpin && (
            <button
              onClick={onUnpin}
              className="rounded px-2 py-0.5 text-xs hover:bg-white/10"
              style={{ color: 'var(--text-secondary)' }}
            >
              Unpin
            </button>
          )}
          {!pinned && onPin && (
            <button
              onClick={onPin}
              className="rounded px-2 py-0.5 text-xs opacity-50 hover:bg-white/10 hover:opacity-100"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Pin
            </button>
          )}
        </div>
      </div>
      {chart.insight && (
        <p className="px-4 pt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {chart.insight}
        </p>
      )}
      <div className="p-2">{renderChart()}</div>
    </div>
  )
}
