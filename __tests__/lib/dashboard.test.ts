import { describe, it, expect } from 'vitest'
import { buildAutoDashboard, generateQuickActions } from '@/lib/dashboard'
import type { ColumnInfo } from '@/lib/types'

function makeColumn(overrides: Partial<ColumnInfo> & { name: string; type: ColumnInfo['type'] }): ColumnInfo {
  return {
    nullCount: 0,
    uniqueCount: 5,
    ...overrides,
  }
}

describe('buildAutoDashboard', () => {
  it('should always include a summary chart', () => {
    const charts = buildAutoDashboard({
      fileName: 'test.csv',
      rowCount: 100,
      columns: [
        makeColumn({ name: 'id', type: 'string' }),
      ],
    })
    const summary = charts.find(c => c.type === 'summary')
    expect(summary).toBeDefined()
    expect(summary!.title).toContain('test.csv')
    expect(summary!.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '총 행 수', value: '100' }),
      ])
    )
  })

  it('should create numeric overview for number columns with stats', () => {
    const charts = buildAutoDashboard({
      fileName: 'test.csv',
      rowCount: 100,
      columns: [
        makeColumn({
          name: 'age',
          type: 'number',
          stats: { min: 20, max: 60, mean: 35, median: 33, std: 10 },
        }),
        makeColumn({
          name: 'score',
          type: 'number',
          stats: { min: 0, max: 100, mean: 75, median: 80, std: 15 },
        }),
      ],
    })
    const numericChart = charts.find(c => c.title === '수치형 컬럼 통계')
    expect(numericChart).toBeDefined()
    expect(numericChart!.type).toBe('bar')
    expect(numericChart!.data).toHaveLength(2)
  })

  it('should create category chart for string columns with topValues', () => {
    const charts = buildAutoDashboard({
      fileName: 'test.csv',
      rowCount: 100,
      columns: [
        makeColumn({
          name: 'city',
          type: 'string',
          uniqueCount: 5,
          topValues: [
            { value: '서울', count: 40 },
            { value: '부산', count: 30 },
            { value: '대구', count: 15 },
            { value: '인천', count: 10 },
            { value: '광주', count: 5 },
          ],
        }),
      ],
    })
    const catChart = charts.find(c => c.title === 'city 분포')
    expect(catChart).toBeDefined()
    expect(catChart!.type).toBe('pie')
    expect(catChart!.data).toHaveLength(5)
  })

  it('should use bar chart for categories with more than 6 unique values', () => {
    const charts = buildAutoDashboard({
      fileName: 'test.csv',
      rowCount: 100,
      columns: [
        makeColumn({
          name: 'product',
          type: 'string',
          uniqueCount: 10,
          topValues: Array.from({ length: 10 }, (_, i) => ({ value: `P${i}`, count: 10 - i })),
        }),
      ],
    })
    const catChart = charts.find(c => c.title === 'product 분포')
    expect(catChart).toBeDefined()
    expect(catChart!.type).toBe('bar')
  })

  it('should create comparison chart when 2+ numeric columns exist', () => {
    const charts = buildAutoDashboard({
      fileName: 'test.csv',
      rowCount: 50,
      columns: [
        makeColumn({
          name: 'height',
          type: 'number',
          stats: { min: 150, max: 200, mean: 170, median: 168, std: 12 },
        }),
        makeColumn({
          name: 'weight',
          type: 'number',
          stats: { min: 40, max: 100, mean: 65, median: 63, std: 15 },
        }),
      ],
    })
    const compChart = charts.find(c => c.title === 'height vs weight')
    expect(compChart).toBeDefined()
    expect(compChart!.data).toHaveLength(2)
  })

  it('should skip category charts for high-cardinality string columns', () => {
    const charts = buildAutoDashboard({
      fileName: 'test.csv',
      rowCount: 100,
      columns: [
        makeColumn({
          name: 'email',
          type: 'string',
          uniqueCount: 100,
          topValues: [{ value: 'a@b.com', count: 1 }],
        }),
      ],
    })
    const catChart = charts.find(c => c.title === 'email 분포')
    expect(catChart).toBeUndefined()
  })
})

describe('generateQuickActions', () => {
  it('should generate timeline action for date + numeric columns', () => {
    const columns: ColumnInfo[] = [
      makeColumn({ name: 'date', type: 'date' }),
      makeColumn({ name: 'revenue', type: 'number' }),
    ]
    const actions = generateQuickActions(columns)
    const timeline = actions.find(a => a.label === '시계열 트렌드 분석')
    expect(timeline).toBeDefined()
    expect(timeline!.columns).toContain('date')
    expect(timeline!.columns).toContain('revenue')
    expect(timeline!.prompt).toContain('date')
  })

  it('should generate group comparison for category + numeric columns', () => {
    const columns: ColumnInfo[] = [
      makeColumn({ name: 'city', type: 'string', uniqueCount: 5 }),
      makeColumn({ name: 'sales', type: 'number' }),
    ]
    const actions = generateQuickActions(columns)
    const group = actions.find(a => a.label === '그룹별 비교 분석')
    expect(group).toBeDefined()
    expect(group!.columns).toContain('city')
  })

  it('should generate correlation action for 2+ numeric columns', () => {
    const columns: ColumnInfo[] = [
      makeColumn({ name: 'age', type: 'number' }),
      makeColumn({ name: 'income', type: 'number' }),
    ]
    const actions = generateQuickActions(columns)
    const corr = actions.find(a => a.label === '상관관계 분석')
    expect(corr).toBeDefined()
    expect(corr!.columns).toEqual(['age', 'income'])
  })

  it('should generate missing data action for columns with null counts', () => {
    const columns: ColumnInfo[] = [
      makeColumn({ name: 'email', type: 'string', nullCount: 10 }),
    ]
    const actions = generateQuickActions(columns)
    const missing = actions.find(a => a.label === '결측치 패턴 분석')
    expect(missing).toBeDefined()
  })

  it('should generate text frequency action for high-cardinality strings', () => {
    const columns: ColumnInfo[] = [
      makeColumn({ name: 'product_name', type: 'string', uniqueCount: 50 }),
    ]
    const actions = generateQuickActions(columns)
    const text = actions.find(a => a.label === '텍스트 빈도 분석')
    expect(text).toBeDefined()
    expect(text!.columns).toContain('product_name')
  })

  it('should return empty array for no matching patterns', () => {
    const columns: ColumnInfo[] = [
      makeColumn({ name: 'id', type: 'string', uniqueCount: 1, nullCount: 0 }),
    ]
    const actions = generateQuickActions(columns)
    expect(actions).toHaveLength(0)
  })
})
