import { describe, it, expect } from 'vitest'
import {
  STEP_CODER,
  SYNTHESIZER,
  PLANNER,
  buildStepCoderSystem,
  buildPlannerSystem,
  buildSynthesizerSystem,
} from '@/lib/prompts'

describe('prompt templates', () => {
  it('STEP_CODER should contain key rules', () => {
    expect(STEP_CODER).toContain('pandas')
    expect(STEP_CODER).toContain('print()')
    expect(STEP_CODER).toContain('parquet')
    expect(STEP_CODER).toContain('CACHED:')
    expect(STEP_CODER).toContain('코드만 출력')
  })

  it('SYNTHESIZER should contain rules for data grounding', () => {
    expect(SYNTHESIZER).toContain('데이터 근거')
    expect(SYNTHESIZER).toContain('상관관계와 인과관계')
    expect(SYNTHESIZER).toContain('followUpQuestions')
  })

  it('PLANNER should output JSON plan', () => {
    expect(PLANNER).toContain('2-4개')
    expect(PLANNER).toContain('"goal"')
    expect(PLANNER).toContain('"steps"')
  })
})

describe('buildStepCoderSystem', () => {
  it('should include data context', () => {
    const result = buildStepCoderSystem('파일: test.csv\n컬럼: a, b')
    expect(result).toContain('test.csv')
    expect(result).toContain(STEP_CODER)
  })

  it('should include cache context when provided', () => {
    const result = buildStepCoderSystem('data', '이전 분석 캐시: ...')
    expect(result).toContain('이전 분석 캐시')
  })

  it('should include learned context when provided', () => {
    const result = buildStepCoderSystem('data', undefined, 'B2B SaaS 회사')
    expect(result).toContain('B2B SaaS')
    expect(result).toContain('비즈니스 컨텍스트')
  })
})

describe('buildPlannerSystem', () => {
  it('should include planner prompt and data', () => {
    const result = buildPlannerSystem('파일: test.csv')
    expect(result).toContain(PLANNER)
    expect(result).toContain('test.csv')
  })

  it('should include cache context when provided', () => {
    const result = buildPlannerSystem('data', '캐시 정보')
    expect(result).toContain('캐시 정보')
  })
})

describe('buildSynthesizerSystem', () => {
  it('should include synthesizer prompt', () => {
    const result = buildSynthesizerSystem()
    expect(result).toContain(SYNTHESIZER)
  })

  it('should include learned context when provided', () => {
    const result = buildSynthesizerSystem('비즈니스 맥락')
    expect(result).toContain('비즈니스 맥락')
  })
})
