import { describe, it, expect } from 'vitest'
import { buildInferencePrompt, parseInferenceResult } from '@/lib/briefing'

describe('buildInferencePrompt', () => {
  it('should build prompt from metadata and profile', () => {
    const prompt = buildInferencePrompt(
      [{ name: 'test.csv', columns: ['id', 'value'], sample: [{ id: '1', value: 100 }] }],
      { qualityScore: 80, totalRows: 100, warnings: [], correlations: [], distributions: [], fileId: 'f1' }
    )
    expect(prompt).toContain('test.csv')
    expect(prompt).toContain('id')
    expect(prompt).toContain('value')
  })

  it('should handle null profile', () => {
    const prompt = buildInferencePrompt(
      [{ name: 'data.csv', columns: ['a'], sample: [] }],
      null
    )
    expect(prompt).toContain('data.csv')
  })
})

describe('parseInferenceResult', () => {
  it('should parse valid JSON response', () => {
    const json = JSON.stringify({
      domain: '테스트',
      briefing: '테스트 데이터입니다',
      columnMeanings: { id: '식별자' },
      keyMetrics: ['value'],
      warnings: [],
      suggestedQuestions: ['분포 분석'],
      greeting: '안녕하세요',
    })
    const result = parseInferenceResult(json)
    expect(result.domain).toBe('테스트')
    expect(result.confirmed).toBe(false)
    expect(result.columnMeanings).toEqual({ id: '식별자' })
  })

  it('should return fallback on invalid JSON', () => {
    const result = parseInferenceResult('invalid json')
    expect(result.domain).toBe('')
    expect(result.confirmed).toBe(false)
  })

  it('should handle partial JSON fields', () => {
    const json = JSON.stringify({ domain: '부분' })
    const result = parseInferenceResult(json)
    expect(result.domain).toBe('부분')
    expect(result.keyMetrics).toEqual([])
    expect(result.suggestedQuestions).toEqual([])
  })
})
