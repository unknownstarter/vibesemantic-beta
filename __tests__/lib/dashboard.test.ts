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
  it('should return empty array when no numeric columns exist', () => {
    const charts = buildAutoDashboard({
      fileName: 'test.csv',
      rowCount: 100,
      columns: [
        makeColumn({ name: 'id', type: 'string' }),
      ],
      sample: [{ id: 'a' }, { id: 'b' }],
    })
    expect(charts).toHaveLength(0)
  })

  it('should create category×metric bar chart when category + numeric columns exist', () => {
    const charts = buildAutoDashboard({
      fileName: 'test.csv',
      rowCount: 100,
      columns: [
        makeColumn({
          name: 'city',
          type: 'string',
          uniqueCount: 3,
          topValues: [
            { value: '서울', count: 40 },
            { value: '부산', count: 30 },
            { value: '대구', count: 15 },
          ],
        }),
        makeColumn({
          name: '세션수',
          type: 'number',
          stats: { min: 10, max: 100, mean: 50, median: 45, std: 20 },
        }),
      ],
      sample: [
        { city: '서울', '세션수': 100 },
        { city: '부산', '세션수': 80 },
        { city: '대구', '세션수': 50 },
      ],
    })
    const catChart = charts.find(c => c.title === 'city별 세션수')
    expect(catChart).toBeDefined()
    expect(catChart!.type).toBe('bar')
    expect(catChart!.data.length).toBeGreaterThanOrEqual(2)
  })

  it('should create secondary metric chart when multiple numeric columns exist with category', () => {
    const charts = buildAutoDashboard({
      fileName: 'test.csv',
      rowCount: 100,
      columns: [
        makeColumn({
          name: 'channel',
          type: 'string',
          uniqueCount: 3,
          topValues: [
            { value: 'organic', count: 50 },
            { value: 'paid', count: 30 },
            { value: 'direct', count: 20 },
          ],
        }),
        makeColumn({
          name: '사용자수',
          type: 'number',
          stats: { min: 10, max: 200, mean: 80, median: 70, std: 40 },
        }),
        makeColumn({
          name: '세션수',
          type: 'number',
          stats: { min: 20, max: 300, mean: 120, median: 100, std: 50 },
        }),
      ],
      sample: [
        { channel: 'organic', '사용자수': 200, '세션수': 300 },
        { channel: 'paid', '사용자수': 100, '세션수': 150 },
        { channel: 'direct', '사용자수': 50, '세션수': 80 },
      ],
    })
    // Primary + secondary metric charts
    expect(charts.length).toBeGreaterThanOrEqual(2)
    expect(charts.some(c => c.title.includes('사용자수') || c.title.includes('세션수'))).toBe(true)
  })

  it('should create scale-aware comparison chart for 2+ numeric columns in same group', () => {
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
      sample: [
        { height: 170, weight: 65 },
        { height: 180, weight: 75 },
        { height: 160, weight: 55 },
      ],
    })
    const compChart = charts.find(c => c.title === 'height vs weight')
    expect(compChart).toBeDefined()
    expect(compChart!.data.length).toBeGreaterThanOrEqual(2)
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
      sample: [{ email: 'a@b.com' }, { email: 'b@c.com' }],
    })
    // email has uniqueCount=100 which exceeds the 50 threshold → no category charts
    const catChart = charts.find(c => c.title.includes('email'))
    expect(catChart).toBeUndefined()
  })

  it('should assign _priority and _source to each chart', () => {
    const charts = buildAutoDashboard({
      fileName: 'myfile.csv',
      rowCount: 50,
      columns: [
        makeColumn({
          name: 'category',
          type: 'string',
          uniqueCount: 3,
          topValues: [
            { value: 'A', count: 20 },
            { value: 'B', count: 15 },
            { value: 'C', count: 10 },
          ],
        }),
        makeColumn({
          name: 'value',
          type: 'number',
          stats: { min: 0, max: 100, mean: 50, median: 45, std: 20 },
        }),
      ],
      sample: [
        { category: 'A', value: 80 },
        { category: 'B', value: 60 },
        { category: 'C', value: 40 },
      ],
    })
    expect(charts.length).toBeGreaterThan(0)
    for (const chart of charts) {
      expect(chart._priority).toBeGreaterThan(0)
      expect(chart._source).toBe('myfile.csv')
    }
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
