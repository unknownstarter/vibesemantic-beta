import { describe, it, expect } from 'vitest'
import { parseCachedFiles, buildCacheContext, buildLearnedContextString, mergeContext } from '@/lib/context'
import type { AnalysisCache, LearnedContext } from '@/lib/types'

describe('parseCachedFiles', () => {
  it('should parse CACHED lines from stdout', () => {
    const stdout = `분석 완료
CACHED: outputs/cache/customer_sales.parquet | columns: ['customer_id', 'total_sales'] | rows: 1234
기타 출력
CACHED: outputs/cache/monthly.parquet | columns: ['month', 'revenue'] | rows: 12`

    const results = parseCachedFiles(stdout)
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      filePath: 'outputs/cache/customer_sales.parquet',
      columns: ['customer_id', 'total_sales'],
      rowCount: 1234,
    })
    expect(results[1]).toEqual({
      filePath: 'outputs/cache/monthly.parquet',
      columns: ['month', 'revenue'],
      rowCount: 12,
    })
  })

  it('should return empty array when no CACHED lines', () => {
    const stdout = '분석 결과:\n총 100건'
    expect(parseCachedFiles(stdout)).toHaveLength(0)
  })
})

describe('buildCacheContext', () => {
  it('should format cache entries as context string', () => {
    const caches: AnalysisCache[] = [
      {
        id: '1',
        sessionId: 's1',
        filePath: 'outputs/cache/sales.parquet',
        description: 'sales',
        columns: ['date', 'amount'],
        rowCount: 100,
        createdAt: '2024-01-01',
      },
    ]
    const context = buildCacheContext(caches)
    expect(context).toContain('이전 분석에서 생성된 데이터')
    expect(context).toContain('sales.parquet')
    expect(context).toContain('date, amount')
    expect(context).toContain('100행')
  })

  it('should return empty string for no caches', () => {
    expect(buildCacheContext([])).toBe('')
  })
})

describe('buildLearnedContextString', () => {
  it('should format learned context', () => {
    const context: LearnedContext = {
      fileId: 'f1',
      columnMeanings: { revenue: '매출' },
      businessContext: 'B2B SaaS 데이터',
      knownRelationships: ['revenue ~ date'],
      previousInsights: ['Q4 성장'],
      updatedAt: '2024-01-01',
    }
    const str = buildLearnedContextString(context)
    expect(str).toContain('B2B SaaS')
    expect(str).toContain('revenue=매출')
    expect(str).toContain('revenue ~ date')
    expect(str).toContain('Q4 성장')
  })

  it('should return empty string for null context', () => {
    expect(buildLearnedContextString(null)).toBe('')
  })
})

describe('mergeContext', () => {
  it('should merge new insights into existing context', () => {
    const existing: LearnedContext = {
      fileId: 'f1',
      columnMeanings: { a: '1' },
      businessContext: 'test',
      knownRelationships: ['r1'],
      previousInsights: ['i1'],
      updatedAt: '2024-01-01',
    }
    const merged = mergeContext(existing, ['i2'], { b: '2' }, ['r2'])
    expect(merged.columnMeanings).toEqual({ a: '1', b: '2' })
    expect(merged.knownRelationships).toEqual(['r1', 'r2'])
    expect(merged.previousInsights).toEqual(['i1', 'i2'])
  })

  it('should create new context from null', () => {
    const merged = mergeContext(null, ['insight1'])
    expect(merged.previousInsights).toEqual(['insight1'])
    expect(merged.columnMeanings).toEqual({})
  })

  it('should keep only last 10 insights', () => {
    const existing: LearnedContext = {
      fileId: 'f1',
      columnMeanings: {},
      businessContext: '',
      knownRelationships: [],
      previousInsights: Array.from({ length: 9 }, (_, i) => `insight-${i}`),
      updatedAt: '2024-01-01',
    }
    const merged = mergeContext(existing, ['new-1', 'new-2'])
    expect(merged.previousInsights).toHaveLength(10)
    expect(merged.previousInsights[9]).toBe('new-2')
  })
})
