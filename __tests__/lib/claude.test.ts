import { describe, it, expect } from 'vitest'
import {
  buildCodeGenMessages,
  buildInterpretMessages,
  extractPythonCode,
  MODEL_CODE_GEN,
  MODEL_INTERPRET,
} from '@/lib/claude'

describe('buildCodeGenMessages', () => {
  it('should build messages with system prompt and metadata', () => {
    const metadata = [
      { name: 'test.csv', columns: ['name', 'age'], sample: [{ name: 'Alice', age: 30 }] }
    ]
    const result = buildCodeGenMessages(metadata, [], '나이별 분포를 보여줘')
    expect(result.system).toContain('분석')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].role).toBe('user')
    expect(result.messages[0].content).toContain('나이별 분포')
  })

  it('should include conversation history', () => {
    const history = [
      { role: 'user' as const, content: '이전 질문' },
      { role: 'assistant' as const, content: '이전 답변' },
    ]
    const result = buildCodeGenMessages([], history, '새 질문')
    expect(result.messages).toHaveLength(3)
  })

  it('should include systemBlocks with cache_control', () => {
    const metadata = [
      { name: 'test.csv', columns: ['name', 'age'], sample: [{ name: 'Alice', age: 30 }] }
    ]
    const result = buildCodeGenMessages(metadata, [], '질문')
    expect(result.systemBlocks).toBeDefined()
    expect(result.systemBlocks).toHaveLength(2)
    expect(result.systemBlocks[0]).toMatchObject({
      type: 'text',
      cache_control: { type: 'ephemeral' },
    })
    expect(result.systemBlocks[1]).toMatchObject({
      type: 'text',
      cache_control: { type: 'ephemeral' },
    })
    expect(result.systemBlocks[1].text).toContain('test.csv')
  })

  it('should include cache context when provided', () => {
    const metadata = [{ name: 'test.csv', columns: ['a'], sample: [] }]
    const result = buildCodeGenMessages(metadata, [], '질문', '이전 캐시 데이터')
    expect(result.systemBlocks[1].text).toContain('이전 캐시 데이터')
  })

  it('should include learned context when provided', () => {
    const metadata = [{ name: 'test.csv', columns: ['a'], sample: [] }]
    const result = buildCodeGenMessages(metadata, [], '질문', undefined, 'B2B SaaS 데이터')
    expect(result.systemBlocks[1].text).toContain('B2B SaaS')
  })
})

describe('extractPythonCode', () => {
  it('should extract code from markdown code block', () => {
    const text = 'Here is the code:\n```python\nimport pandas as pd\nprint("hello")\n```\nDone.'
    expect(extractPythonCode(text)).toBe('import pandas as pd\nprint("hello")')
  })

  it('should return full text if no code block', () => {
    const text = 'import pandas as pd\nprint("hello")'
    expect(extractPythonCode(text)).toBe(text)
  })
})

describe('buildInterpretMessages', () => {
  it('should build messages for result interpretation', () => {
    const result = buildInterpretMessages('코드 실행 결과:\n총 100건', '원본 질문')
    expect(result.system).toContain('분석')
    expect(result.messages[0].content).toContain('총 100건')
  })

  it('should include systemBlocks with cache_control', () => {
    const result = buildInterpretMessages('결과', '질문')
    expect(result.systemBlocks).toHaveLength(1)
    expect(result.systemBlocks[0]).toMatchObject({
      type: 'text',
      cache_control: { type: 'ephemeral' },
    })
  })

  it('should include learned context in system when provided', () => {
    const result = buildInterpretMessages('결과', '질문', 'B2B SaaS')
    expect(result.system).toContain('B2B SaaS')
  })
})

describe('model constants', () => {
  it('should use Sonnet for code generation', () => {
    expect(MODEL_CODE_GEN).toBe('claude-sonnet-4-20250514')
  })

  it('should use Haiku for interpretation', () => {
    expect(MODEL_INTERPRET).toBe('claude-haiku-4-5-20251001')
  })
})
