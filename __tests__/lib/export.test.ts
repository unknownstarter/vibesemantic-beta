import { describe, it, expect } from 'vitest'
import { exportAsScript, exportAsNotebook } from '@/lib/export'
import type { ChatMessage } from '@/lib/types'

const sampleMessages: ChatMessage[] = [
  { role: 'user', content: '매출 분석해줘' },
  { role: 'assistant', content: '매출은 Q4에 40% 증가했습니다.', code: 'import pandas as pd\ndf = pd.read_csv("data.csv")\nprint(df.describe())' },
  { role: 'user', content: '지역별 차이는?' },
  { role: 'assistant', content: '서울이 가장 높습니다.', code: 'print(df.groupby("region").sum())' },
]

describe('exportAsScript', () => {
  it('should generate valid Python script', () => {
    const script = exportAsScript(sampleMessages, '매출 분석')
    expect(script).toContain('# 매출 분석')
    expect(script).toContain('import pandas as pd')
    expect(script).toContain("plt.rcParams['font.family'] = 'AppleGothic'")
  })

  it('should include user questions as comments', () => {
    const script = exportAsScript(sampleMessages, 'Test')
    expect(script).toContain('# 질문: 매출 분석해줘')
    expect(script).toContain('# 질문: 지역별 차이는?')
  })

  it('should include code blocks', () => {
    const script = exportAsScript(sampleMessages, 'Test')
    expect(script).toContain('df = pd.read_csv("data.csv")')
    expect(script).toContain('df.groupby("region").sum()')
  })

  it('should handle messages without code', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: '질문' },
      { role: 'assistant', content: '응답만 있고 코드 없음' },
    ]
    const script = exportAsScript(msgs, 'Test')
    expect(script).toContain('# 인사이트: 응답만 있고 코드 없음')
  })
})

describe('exportAsNotebook', () => {
  it('should generate valid notebook structure', () => {
    const nb = exportAsNotebook(sampleMessages, '매출 분석')
    expect(nb.nbformat).toBe(4)
    expect(nb.metadata.kernelspec.language).toBe('python')
    expect(nb.cells.length).toBeGreaterThan(0)
  })

  it('should have title markdown cell', () => {
    const nb = exportAsNotebook(sampleMessages, '매출 분석')
    const titleCell = nb.cells[0]
    expect(titleCell.cell_type).toBe('markdown')
    expect(titleCell.source.join('')).toContain('매출 분석')
  })

  it('should have setup code cell', () => {
    const nb = exportAsNotebook(sampleMessages, 'Test')
    const setupCell = nb.cells[1]
    expect(setupCell.cell_type).toBe('code')
    expect(setupCell.source.join('')).toContain('import pandas')
  })

  it('should include question markdown + code cells', () => {
    const nb = exportAsNotebook(sampleMessages, 'Test')
    const markdownCells = nb.cells.filter(c => c.cell_type === 'markdown')
    const codeCells = nb.cells.filter(c => c.cell_type === 'code')

    // title + setup + 2 questions + 2 results = at least those
    expect(markdownCells.length).toBeGreaterThanOrEqual(3)
    expect(codeCells.length).toBeGreaterThanOrEqual(3) // setup + 2 code blocks
  })

  it('should have valid .ipynb JSON structure', () => {
    const nb = exportAsNotebook(sampleMessages, 'Test')
    const json = JSON.stringify(nb)
    expect(() => JSON.parse(json)).not.toThrow()
    const parsed = JSON.parse(json)
    expect(parsed.nbformat).toBe(4)
    expect(parsed.cells).toBeInstanceOf(Array)
  })
})
