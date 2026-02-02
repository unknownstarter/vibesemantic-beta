import { describe, it, expect } from 'vitest'
import { buildCodeGenMessages, buildInterpretMessages, extractPythonCode } from '@/lib/claude'

describe('buildCodeGenMessages', () => {
  it('should build messages with system prompt and metadata', () => {
    const metadata = [
      { name: 'test.csv', columns: ['name', 'age'], sample: [{ name: 'Alice', age: 30 }] }
    ]
    const result = buildCodeGenMessages(metadata, [], '나이별 분포를 보여줘')
    expect(result.system).toContain('데이터 분석')
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
})
