import { v4 as uuid } from 'uuid'
import type { ColumnInfo, ChartData, QuickAction } from './types'

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

// ========== Quick Actions 생성 ==========

export function generateQuickActions(columns: ColumnInfo[]): QuickAction[] {
  const actions: QuickAction[] = []

  const dateCols = columns.filter(c => c.type === 'date')
  const numericCols = columns.filter(c => c.type === 'number')
  const categoryCols = columns.filter(c => c.type === 'string' && c.uniqueCount >= 2 && c.uniqueCount <= 20)
  const highMissingCols = columns.filter(c => c.nullCount > 0)
  const highCardinalityCols = columns.filter(c => c.type === 'string' && c.uniqueCount > 20)

  // 날짜 + 수치 → 시계열 분석
  if (dateCols.length > 0 && numericCols.length > 0) {
    const dateCol = dateCols[0]
    const numCol = numericCols[0]
    actions.push({
      id: uuid(),
      label: '시계열 트렌드 분석',
      description: `${dateCol.name} 컬럼과 ${numCol.name} 컬럼으로 시간 흐름에 따른 추이를 분석합니다`,
      prompt: `${dateCol.name}을 기준으로 ${numCol.name}의 시계열 트렌드를 분석해줘. 월별 추이 차트도 생성해줘.`,
      icon: 'timeline',
      columns: [dateCol.name, numCol.name],
    })
  }

  // 범주형 + 수치형 → 그룹비교
  if (categoryCols.length > 0 && numericCols.length > 0) {
    const catCol = categoryCols[0]
    const numCol = numericCols[0]
    actions.push({
      id: uuid(),
      label: '그룹별 비교 분석',
      description: `${catCol.name}별로 ${numCol.name}을 비교 분석합니다`,
      prompt: `${catCol.name}별로 ${numCol.name}의 평균, 중앙값, 표준편차를 비교 분석해줘. 바 차트로 시각화해줘.`,
      icon: 'group',
      columns: [catCol.name, numCol.name],
    })
  }

  // 수치형 2개+ → 상관분석
  if (numericCols.length >= 2) {
    const col1 = numericCols[0]
    const col2 = numericCols[1]
    actions.push({
      id: uuid(),
      label: '상관관계 분석',
      description: `${col1.name}과 ${col2.name} 간의 상관관계를 분석합니다`,
      prompt: `수치형 컬럼들 간의 상관관계를 분석해줘. 특히 ${col1.name}과 ${col2.name}의 산점도와 상관계수를 보여줘.`,
      icon: 'scatter',
      columns: [col1.name, col2.name],
    })
  }

  // 결측치가 있는 컬럼 → 결측치 패턴 분석
  if (highMissingCols.length > 0) {
    const colNames = highMissingCols.slice(0, 3).map(c => c.name)
    actions.push({
      id: uuid(),
      label: '결측치 패턴 분석',
      description: `${colNames.join(', ')} 등의 결측치 패턴을 분석합니다`,
      prompt: `데이터의 결측치 패턴을 분석해줘. 어떤 컬럼에 결측이 많은지, 결측치 간 상관관계가 있는지 확인해줘.`,
      icon: 'missing',
      columns: colNames,
    })
  }

  // 고유값 많은 텍스트 → 빈도 분석
  if (highCardinalityCols.length > 0) {
    const col = highCardinalityCols[0]
    actions.push({
      id: uuid(),
      label: '텍스트 빈도 분석',
      description: `${col.name} 컬럼의 값 빈도를 분석합니다`,
      prompt: `${col.name} 컬럼의 상위 20개 값 빈도를 분석하고 바 차트로 시각화해줘.`,
      icon: 'text',
      columns: [col.name],
    })
  }

  return actions
}
