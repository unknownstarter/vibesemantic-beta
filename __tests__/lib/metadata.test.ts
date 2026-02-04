import { describe, it, expect, vi } from 'vitest'
import path from 'path'

// LLM 호출을 모킹 — 단위 테스트에서는 휴리스틱 폴백으로 동작 확인
vi.mock('@/lib/claude', () => ({
  callClaude: vi.fn().mockRejectedValue(new Error('mocked: no API in test')),
  MODEL_INTERPRET: 'mock-model',
}))

import { extractMetadata, extractAllSections } from '@/lib/metadata'

const FIXTURES = path.join(__dirname, '..', 'fixtures')

describe('extractMetadata', () => {
  it('should extract columns, rowCount, and sample from CSV', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'sample.csv'))
    expect(result.columns).toHaveLength(4)
    expect(result.columns[0].name).toBe('name')
    expect(result.columns[1].name).toBe('age')
    expect(result.columns[1].type).toBe('number')
    expect(result.columns[3].type).toBe('date')
    expect(result.rowCount).toBe(5)
    expect(result.sample).toHaveLength(5)
  })

  it('should handle Korean CSV', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'korean.csv'))
    expect(result.columns[0].name).toBe('이름')
    expect(result.rowCount).toBe(3)
  })

  it('should handle CSV with headers only', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'empty.csv'))
    expect(result.columns).toHaveLength(3)
    expect(result.rowCount).toBe(0)
    expect(result.sample).toHaveLength(0)
  })

  it('should compute numeric stats for number columns', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'sample.csv'))
    const ageCol = result.columns.find(c => c.name === 'age')!
    expect(ageCol.stats).toBeDefined()
    expect(ageCol.stats!.min).toBe(25)
    expect(ageCol.stats!.max).toBe(35)
    expect(ageCol.stats!.mean).toBe(30)
    expect(ageCol.stats!.median).toBe(30)
    expect(ageCol.stats!.std).toBeGreaterThan(0)
  })

  it('should compute topValues for string columns', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'sample.csv'))
    const nameCol = result.columns.find(c => c.name === 'name')!
    expect(nameCol.topValues).toBeDefined()
    expect(nameCol.topValues!.length).toBe(5)
    expect(nameCol.topValues![0]).toHaveProperty('value')
    expect(nameCol.topValues![0]).toHaveProperty('count')
  })

  it('should detect header row in Excel-exported CSV with preamble (heuristic fallback)', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'excel-export.csv'))
    expect(result.columns.length).toBeGreaterThanOrEqual(5)
    const colNames = result.columns.map(c => c.name)
    expect(colNames).toContain('유저 세그먼트')
    expect(colNames).toContain('유니크 유저 수')
    expect(colNames).toContain('RV')
    expect(result.rowCount).toBe(3)
    expect(result.sample).toHaveLength(3)
  })

  it('should use LLM single-section response (backward compat)', async () => {
    const { callClaude } = await import('@/lib/claude')
    const mockedCallClaude = vi.mocked(callClaude)

    // LLM이 이전 단일 섹션 포맷으로 응답하는 시나리오 (하위 호환)
    mockedCallClaude.mockResolvedValueOnce('{ "headerRow": 7, "dataStartRow": 8, "dataEndRow": 11, "hasHeader": true }')

    const result = await extractMetadata(path.join(FIXTURES, 'excel-export.csv'))
    expect(result.columns.length).toBeGreaterThanOrEqual(5)
    const colNames = result.columns.map(c => c.name)
    expect(colNames).toContain('유저 세그먼트')
    expect(result.rowCount).toBe(3)
  })
})

describe('extractAllSections', () => {
  it('should return single section for simple CSV (heuristic fallback)', async () => {
    const sections = await extractAllSections(path.join(FIXTURES, 'sample.csv'))
    expect(sections).toHaveLength(1)
    expect(sections[0].columns).toHaveLength(4)
    expect(sections[0].rowCount).toBe(5)
    expect(sections[0].sectionName).toBe('전체 데이터')
  })

  it('should return multiple sections when LLM detects them', async () => {
    const { callClaude } = await import('@/lib/claude')
    const mockedCallClaude = vi.mocked(callClaude)

    // LLM이 멀티 섹션을 감지한 시나리오
    mockedCallClaude.mockResolvedValueOnce(JSON.stringify({
      hasHeader: true,
      sections: [
        { name: '인적 정보', headerRow: 3, dataStartRow: 4, dataEndRow: 7 },
        { name: '2차 평가', headerRow: 10, dataStartRow: 11, dataEndRow: 14 },
      ],
    }))

    const sections = await extractAllSections(path.join(FIXTURES, 'multi-section.csv'))
    expect(sections).toHaveLength(2)

    // 섹션 1: 인적 정보
    expect(sections[0].sectionName).toBe('인적 정보')
    expect(sections[0].columns.map(c => c.name)).toContain('name')
    expect(sections[0].columns.map(c => c.name)).toContain('age')
    expect(sections[0].rowCount).toBe(3)

    // 섹션 2: 2차 평가
    expect(sections[1].sectionName).toBe('2차 평가')
    expect(sections[1].columns.map(c => c.name)).toContain('score')
    expect(sections[1].columns.map(c => c.name)).toContain('grade')
    expect(sections[1].rowCount).toBe(3)
  })

  it('should handle LLM multi-section format for single-section file', async () => {
    const { callClaude } = await import('@/lib/claude')
    const mockedCallClaude = vi.mocked(callClaude)

    // LLM이 1개 섹션만 포함한 sections 배열로 응답
    mockedCallClaude.mockResolvedValueOnce(JSON.stringify({
      hasHeader: true,
      sections: [
        { name: '전체 데이터', headerRow: 7, dataStartRow: 8, dataEndRow: 11 },
      ],
    }))

    const sections = await extractAllSections(path.join(FIXTURES, 'excel-export.csv'))
    expect(sections).toHaveLength(1)
    expect(sections[0].sectionName).toBe('전체 데이터')
    expect(sections[0].rowCount).toBe(3)
  })

  it('each section should have independent column analysis', async () => {
    const { callClaude } = await import('@/lib/claude')
    const mockedCallClaude = vi.mocked(callClaude)

    mockedCallClaude.mockResolvedValueOnce(JSON.stringify({
      hasHeader: true,
      sections: [
        { name: '인적 정보', headerRow: 3, dataStartRow: 4, dataEndRow: 7 },
        { name: '2차 평가', headerRow: 10, dataStartRow: 11, dataEndRow: 14 },
      ],
    }))

    const sections = await extractAllSections(path.join(FIXTURES, 'multi-section.csv'))

    // 섹션 1: age는 숫자 타입
    const ageCol = sections[0].columns.find(c => c.name === 'age')!
    expect(ageCol.type).toBe('number')
    expect(ageCol.stats).toBeDefined()
    expect(ageCol.stats!.min).toBe(25)
    expect(ageCol.stats!.max).toBe(35)

    // 섹션 2: score는 숫자 타입
    const scoreCol = sections[1].columns.find(c => c.name === 'score')!
    expect(scoreCol.type).toBe('number')
    expect(scoreCol.stats).toBeDefined()
    expect(scoreCol.stats!.min).toBe(78)
    expect(scoreCol.stats!.max).toBe(92)

    // 섹션 2: grade는 문자 타입
    const gradeCol = sections[1].columns.find(c => c.name === 'grade')!
    expect(gradeCol.type).toBe('string')
    expect(gradeCol.topValues).toBeDefined()
  })
})
