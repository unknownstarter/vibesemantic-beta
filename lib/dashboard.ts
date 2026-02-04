import { v4 as uuid } from 'uuid'
import type { ColumnInfo, ChartData, QuickAction } from './types'
import type { MetadataResult } from './metadata'

interface DashboardInput {
  fileName: string
  columns: ColumnInfo[]
  rowCount: number
  sample: Record<string, unknown>[]
}

// ========== 컬럼 의미 분류 ==========

type SemanticType = 'count' | 'rate' | 'time' | 'revenue' | 'per_user' | 'generic'

function classifyColumn(col: ColumnInfo): SemanticType {
  const name = col.name.toLowerCase()
  if (/율|비율|rate|ratio|전환/.test(name)) return 'rate'
  if (/시간|time|duration/.test(name)) return 'time'
  if (/수익|매출|revenue|금액|amount/.test(name)) return 'revenue'
  if (/당|per/.test(name)) return 'per_user'
  if (/수$|수\b|count|사용자|세션|조회|이벤트|방문/.test(name)) return 'count'
  if (col.stats && col.stats.min >= 0 && col.stats.max <= 1) return 'rate'
  return 'generic'
}

function scaleGroup(semantic: SemanticType): string {
  switch (semantic) {
    case 'count': return 'count'
    case 'rate': return 'rate'
    case 'time': return 'time'
    case 'revenue': return 'revenue'
    case 'per_user': return 'per_user'
    default: return 'generic'
  }
}

// ========== 차트 우선순위 (큐레이션용) ==========

interface ScoredChart extends ChartData {
  _priority: number // 높을수록 중요
  _source: string   // 출처 파일명
}

// ========== 메인 대시보드 빌더 ==========

export function buildAutoDashboard(input: DashboardInput): ScoredChart[] {
  const charts: ScoredChart[] = []
  const { fileName, columns, sample } = input

  const numericCols = columns.filter(c => c.type === 'number' && c.stats)
  const categoryCols = columns.filter(
    c => c.type === 'string' && c.topValues && c.uniqueCount >= 2 && c.uniqueCount <= 50
  )
  const stringCols = columns.filter(c => c.type === 'string')
  const labelCol = categoryCols.length > 0 ? categoryCols[0] : (stringCols.length > 0 ? stringCols[0] : null)

  // 1. 카테고리 → 핵심 메트릭 차트 (가장 가치 높은 차트)
  if (categoryCols.length > 0 && numericCols.length > 0 && sample.length > 0) {
    const catCol = categoryCols[0]
    const primaryMetric = findPrimaryMetric(numericCols)
    if (primaryMetric) {
      const chart = buildCategoryMetricChart(catCol, primaryMetric, sample)
      charts.push({ ...chart, _priority: 100, _source: fileName })
    }

    // 2순위 메트릭으로 추가 카테고리 차트 (다른 관점)
    const secondMetric = findSecondaryMetric(numericCols, primaryMetric)
    if (secondMetric) {
      const chart = buildCategoryMetricChart(catCol, secondMetric, sample)
      charts.push({ ...chart, _priority: 80, _source: fileName })
    }
  }

  // 2. 스케일 호환 비교 차트 (카테고리 차트가 없거나 보조용)
  const scaleGroups = groupByScale(numericCols)
  for (const [group, cols] of Object.entries(scaleGroups)) {
    if (cols.length >= 2) {
      const chart = buildScaleAwareComparison(cols[0], cols[1], sample, group, labelCol)
      // 카테고리 차트가 이미 있으면 우선순위 낮춤
      const priority = charts.length === 0 ? 70 : 40
      charts.push({ ...chart, _priority: priority, _source: fileName })
      break
    }
  }

  return charts
}

/** 전체 파일에서 생성된 차트를 큐레이션하여 최적 세트 반환 */
export function curateDashboard(allCharts: ScoredChart[], maxCharts: number = 6): ChartData[] {
  // 데이터 포인트가 2개 미만인 차트 제거 (단일 바 차트는 무의미)
  const meaningful = allCharts.filter(c => c.data.length >= 2)

  // 우선순위 내림차순 정렬
  const sorted = [...meaningful].sort((a, b) => b._priority - a._priority)

  // 중복 제거: 같은 제목의 차트는 우선순위 높은 것만
  const seen = new Set<string>()
  const unique = sorted.filter(c => {
    if (seen.has(c.title)) return false
    seen.add(c.title)
    return true
  })

  // 소스 다양성: 라운드 로빈으로 각 파일에서 균등 선택
  const bySource = new Map<string, ScoredChart[]>()
  for (const c of unique) {
    if (!bySource.has(c._source)) bySource.set(c._source, [])
    bySource.get(c._source)!.push(c)
  }

  const selected: ScoredChart[] = []
  const sources = [...bySource.keys()]
  let round = 0
  while (selected.length < maxCharts) {
    let added = false
    for (const src of sources) {
      if (selected.length >= maxCharts) break
      const srcCharts = bySource.get(src)!
      if (round < srcCharts.length) {
        selected.push(srcCharts[round])
        added = true
      }
    }
    if (!added) break
    round++
  }

  // _priority 제거, _source → source 변환하여 ChartData로 반환
  return selected.map(({ _priority, _source, ...chart }) => ({ ...chart, source: _source }))
}

// ========== 차트 빌더 함수들 ==========

/** 카테고리별 실제 메트릭 값 바차트 (예: 채널별 세션수) */
function buildCategoryMetricChart(
  catCol: ColumnInfo,
  metricCol: ColumnInfo,
  sample: Record<string, unknown>[],
): ChartData {
  const dataMap = new Map<string, number>()
  for (const row of sample) {
    const cat = String(row[catCol.name] ?? '')
    const val = Number(row[metricCol.name] ?? 0)
    if (cat && !isNaN(val)) {
      dataMap.set(cat, (dataMap.get(cat) ?? 0) + val)
    }
  }

  const data = [...dataMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({
      name: name.length > 15 ? name.slice(0, 15) + '…' : name,
      value,
    }))

  return {
    id: uuid(),
    type: 'bar',
    title: `${catCol.name}별 ${metricCol.name}`,
    data,
    xKey: 'name',
    yKey: 'value',
  }
}

/** 같은 스케일 컬럼끼리 비교 */
function buildScaleAwareComparison(
  col1: ColumnInfo,
  col2: ColumnInfo,
  sample: Record<string, unknown>[],
  _group: string,
  labelCol: ColumnInfo | null = null,
): ChartData {
  const raw = sample
    .map((row) => ({
      label: labelCol ? String(row[labelCol.name] ?? '') : '',
      v1: Number(row[col1.name] ?? 0),
      v2: Number(row[col2.name] ?? 0),
    }))
    .filter(d => d.v1 !== 0 || d.v2 !== 0)
    .sort((a, b) => b.v1 - a.v1)
    .slice(0, 10)

  const hasLabels = labelCol && raw.some(d => d.label.length > 0)
  const data = raw.map((d, i) => {
    const name = hasLabels
      ? (d.label.length > 12 ? d.label.slice(0, 12) + '…' : d.label)
      : String(i + 1)
    return { name, [col1.name]: d.v1, [col2.name]: d.v2 }
  })

  const type: ChartData['type'] = hasLabels ? 'bar' : (data.length > 5 ? 'line' : 'bar')

  return {
    id: uuid(),
    type,
    title: `${col1.name} vs ${col2.name}`,
    data,
    xKey: 'name',
    yKey: col1.name,
  }
}

// ========== 유틸리티 ==========

function findPrimaryMetric(numericCols: ColumnInfo[]): ColumnInfo | null {
  const countCols = numericCols.filter(c => classifyColumn(c) === 'count')
  if (countCols.length > 0) {
    return countCols.sort((a, b) => (b.stats?.mean ?? 0) - (a.stats?.mean ?? 0))[0]
  }
  return numericCols.sort((a, b) => (b.stats?.std ?? 0) - (a.stats?.std ?? 0))[0] ?? null
}

function findSecondaryMetric(numericCols: ColumnInfo[], primary: ColumnInfo | null): ColumnInfo | null {
  if (!primary) return null
  // primary와 다른 컬럼 중 가장 중요한 count 메트릭 (같은 타입 OK)
  const candidates = numericCols
    .filter(c => c.name !== primary.name)
    .sort((a, b) => {
      // count 타입 우선, 그다음 분산 크기
      const aIsCount = classifyColumn(a) === 'count' ? 1 : 0
      const bIsCount = classifyColumn(b) === 'count' ? 1 : 0
      if (aIsCount !== bIsCount) return bIsCount - aIsCount
      return (b.stats?.std ?? 0) - (a.stats?.std ?? 0)
    })
  return candidates[0] ?? null
}

function groupByScale(cols: ColumnInfo[]): Record<string, ColumnInfo[]> {
  const groups: Record<string, ColumnInfo[]> = {}
  for (const col of cols) {
    const group = scaleGroup(classifyColumn(col))
    if (!groups[group]) groups[group] = []
    groups[group].push(col)
  }
  return groups
}

// ========== 교차 섹션 비교 차트 ==========

/** 멀티 섹션 데이터에서 시나리오 비교 차트 생성 */
export function buildCrossSectionCharts(
  sections: MetadataResult[],
  fileName: string,
): ScoredChart[] {
  if (sections.length < 2) return []

  const charts: ScoredChart[] = []

  // 모든 섹션에 공통으로 존재하는 숫자 컬럼 찾기
  const firstCols = new Set(sections[0].columns.filter(c => c.type === 'number').map(c => c.name))
  const commonNumeric = [...firstCols].filter(colName =>
    sections.every(s => s.columns.some(c => c.name === colName && c.type === 'number'))
  )

  // 핵심 메트릭 선정: 분산이 큰 컬럼 우선 (섹션 간 차이가 의미 있는 것)
  const colsWithVariance = commonNumeric.map(colName => {
    const means = sections.map(s => {
      const col = s.columns.find(c => c.name === colName)
      return col?.stats?.mean ?? 0
    })
    const avg = means.reduce((a, b) => a + b, 0) / means.length
    const variance = avg > 0
      ? means.reduce((acc, m) => acc + ((m - avg) / avg) ** 2, 0) / means.length
      : 0
    return { colName, variance, means }
  }).filter(c => c.variance > 0.01) // 섹션 간 1% 이상 변동이 있는 것만
    .sort((a, b) => b.variance - a.variance)

  // 상위 3개 핵심 메트릭으로 교차 비교 차트 생성
  for (const { colName } of colsWithVariance.slice(0, 3)) {
    const data = sections.map(s => {
      const col = s.columns.find(c => c.name === colName)
      const sectionLabel = s.sectionName ?? '데이터'
      const shortLabel = sectionLabel.length > 12
        ? sectionLabel.slice(0, 12) + '…'
        : sectionLabel
      return {
        name: shortLabel,
        value: col?.stats?.mean ?? 0,
      }
    }).filter(d => d.value !== 0)

    if (data.length >= 2) {
      charts.push({
        id: uuid(),
        type: 'bar',
        title: `시나리오별 ${colName} 비교`,
        data,
        xKey: 'name',
        yKey: 'value',
        _priority: 95,
        _source: `교차 분석 — ${fileName}`,
      })
    }
  }

  // 총합 비교 차트: 각 섹션의 주요 count 메트릭 합산
  const countCols = commonNumeric.filter(colName => {
    const col = sections[0].columns.find(c => c.name === colName)
    return col ? classifyColumn(col) === 'count' : false
  })

  if (countCols.length > 0) {
    const primaryCount = countCols[0]
    const data = sections.map(s => {
      const total = s.sample.reduce((sum, row) => sum + Number(row[primaryCount] ?? 0), 0)
      const sectionLabel = s.sectionName ?? '데이터'
      const shortLabel = sectionLabel.length > 12
        ? sectionLabel.slice(0, 12) + '…'
        : sectionLabel
      return { name: shortLabel, value: Math.round(total) }
    }).filter(d => d.value !== 0)

    if (data.length >= 2) {
      charts.push({
        id: uuid(),
        type: 'bar',
        title: `시나리오별 ${primaryCount} 합계 비교`,
        data,
        xKey: 'name',
        yKey: 'value',
        _priority: 90,
        _source: `교차 분석 — ${fileName}`,
      })
    }
  }

  return charts
}

// ========== Quick Actions 생성 ==========

export function generateQuickActions(columns: ColumnInfo[]): QuickAction[] {
  const actions: QuickAction[] = []

  const dateCols = columns.filter(c => c.type === 'date')
  const numericCols = columns.filter(c => c.type === 'number')
  const categoryCols = columns.filter(c => c.type === 'string' && c.uniqueCount >= 2 && c.uniqueCount <= 20)
  const highMissingCols = columns.filter(c => c.nullCount > 0)
  const highCardinalityCols = columns.filter(c => c.type === 'string' && c.uniqueCount > 20)

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
