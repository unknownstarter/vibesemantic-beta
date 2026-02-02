import { v4 as uuid } from 'uuid'
import type { ColumnInfo, ChartData } from './types'

interface DashboardInput {
  fileName: string
  columns: ColumnInfo[]
  rowCount: number
}

export function buildAutoDashboard(input: DashboardInput): ChartData[] {
  const charts: ChartData[] = []
  const { fileName, columns, rowCount } = input

  // 1. 요약 카드
  charts.push(buildSummaryChart(fileName, rowCount, columns))

  // 2. 수치형 컬럼 → 히스토그램 또는 바 차트
  const numericCols = columns.filter(c => c.type === 'number' && c.stats)
  if (numericCols.length > 0) {
    charts.push(buildNumericOverview(numericCols))
  }

  // 3. 범주형 컬럼 → 파이/바 차트 (유니크 값 2~20개인 경우)
  const categoricalCols = columns.filter(
    c => c.type === 'string' && c.topValues && c.uniqueCount >= 2 && c.uniqueCount <= 20
  )
  for (const col of categoricalCols.slice(0, 3)) {
    charts.push(buildCategoryChart(col))
  }

  // 4. 수치형 2개 이상이면 첫 번째 쌍으로 비교 바 차트
  if (numericCols.length >= 2) {
    charts.push(buildComparisonChart(numericCols[0], numericCols[1]))
  }

  return charts
}

function buildSummaryChart(fileName: string, rowCount: number, columns: ColumnInfo[]): ChartData {
  const numericCount = columns.filter(c => c.type === 'number').length
  const stringCount = columns.filter(c => c.type === 'string').length
  const dateCount = columns.filter(c => c.type === 'date').length

  const data: Array<Record<string, unknown>> = [
    { label: '총 행 수', value: rowCount.toLocaleString() },
    { label: '컬럼 수', value: String(columns.length) },
    { label: '수치형', value: String(numericCount) },
    { label: '문자형', value: String(stringCount) },
  ]
  if (dateCount > 0) {
    data.push({ label: '날짜형', value: String(dateCount) })
  }

  return {
    id: uuid(),
    type: 'summary',
    title: `${fileName} 요약`,
    data,
  }
}

function buildNumericOverview(numericCols: ColumnInfo[]): ChartData {
  const data = numericCols.map(col => ({
    name: col.name,
    평균: col.stats!.mean,
    중앙값: col.stats!.median,
    최솟값: col.stats!.min,
    최댓값: col.stats!.max,
  }))

  return {
    id: uuid(),
    type: 'bar',
    title: '수치형 컬럼 통계',
    data,
    xKey: 'name',
    yKey: '평균',
  }
}

function buildCategoryChart(col: ColumnInfo): ChartData {
  const data = col.topValues!.map(tv => ({
    name: tv.value,
    count: tv.count,
  }))

  const type: ChartData['type'] = col.uniqueCount <= 6 ? 'pie' : 'bar'

  return {
    id: uuid(),
    type,
    title: `${col.name} 분포`,
    data,
    xKey: 'name',
    yKey: 'count',
  }
}

function buildComparisonChart(col1: ColumnInfo, col2: ColumnInfo): ChartData {
  const data = [
    {
      name: col1.name,
      평균: col1.stats!.mean,
      중앙값: col1.stats!.median,
    },
    {
      name: col2.name,
      평균: col2.stats!.mean,
      중앙값: col2.stats!.median,
    },
  ]

  return {
    id: uuid(),
    type: 'bar',
    title: `${col1.name} vs ${col2.name}`,
    data,
    xKey: 'name',
    yKey: '평균',
  }
}
