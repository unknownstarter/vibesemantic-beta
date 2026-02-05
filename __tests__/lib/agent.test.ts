import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Claude API calls
vi.mock('@/lib/claude', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    callClaude: vi.fn().mockImplementation(async (options: { messages: Array<{ role: string; content: string }>; model: string }) => {
      const userMsg = options.messages[options.messages.length - 1]?.content ?? ''

      // Haiku model is used for planning
      if (options.model === 'claude-haiku-4-5-20251001') {
        return JSON.stringify({
          goal: '매출 분석',
          steps: [
            { order: 1, description: '월별 매출 합계 계산' },
            { order: 2, description: '시각화 생성' },
          ],
        })
      }

      // If code generation (has 파일 경로) → return Python code
      if (userMsg.includes('파일 경로')) {
        return '```python\nimport pandas as pd\nprint("결과: 총 100건")\n```'
      }

      // If synthesis (has 분석 결과) → return insight with follow-ups
      if (userMsg.includes('분석 결과')) {
        return `매출은 Q4에 40% 증가했습니다. 행 1-100 기준.

\`\`\`json
{"followUpQuestions": ["원인은?", "지역별 차이는?", "향후 전망은?"]}
\`\`\``
      }

      return 'fallback response'
    }),
  }
})

// Mock executor
vi.mock('@/lib/executor', () => ({
  validateCode: vi.fn().mockReturnValue({ safe: true, reason: '' }),
  executePython: vi.fn().mockResolvedValue({
    stdout: '결과: 총 100건\n',
    stderr: '',
    exitCode: 0,
    generatedFiles: [],
  }),
}))

// Import after mocks
import { runAgentLoop, parseRechartsCharts } from '@/lib/agent'
import { SessionStore } from '@/lib/sessions'

describe('parseRechartsCharts', () => {
  it('should parse single RECHARTS_JSON line', () => {
    const stdout = `결과: 총 100건
RECHARTS_JSON:{"type":"bar","title":"매출 분포","data":[{"name":"A","value":10},{"name":"B","value":20}],"xKey":"name","yKey":"value"}
분석 완료`
    const charts = parseRechartsCharts(stdout)
    expect(charts).toHaveLength(1)
    expect(charts[0].type).toBe('bar')
    expect(charts[0].title).toBe('매출 분포')
    expect(charts[0].data).toHaveLength(2)
    expect(charts[0].xKey).toBe('name')
    expect(charts[0].yKey).toBe('value')
    expect(charts[0].source).toBe('Chat Analysis')
  })

  it('should parse multiple RECHARTS_JSON lines', () => {
    const stdout = `RECHARTS_JSON:{"type":"bar","title":"차트1","data":[{"x":"A","y":1}],"xKey":"x","yKey":"y"}
RECHARTS_JSON:{"type":"pie","title":"차트2","data":[{"name":"X","value":50}],"xKey":"name","yKey":"value"}`
    const charts = parseRechartsCharts(stdout)
    expect(charts).toHaveLength(2)
    expect(charts[0].type).toBe('bar')
    expect(charts[1].type).toBe('pie')
  })

  it('should skip malformed JSON', () => {
    const stdout = `RECHARTS_JSON:{invalid json}
RECHARTS_JSON:{"type":"bar","title":"OK","data":[{"a":1}],"xKey":"a","yKey":"a"}`
    const charts = parseRechartsCharts(stdout)
    expect(charts).toHaveLength(1)
    expect(charts[0].title).toBe('OK')
  })

  it('should skip charts with empty data', () => {
    const stdout = `RECHARTS_JSON:{"type":"bar","title":"Empty","data":[],"xKey":"x","yKey":"y"}`
    const charts = parseRechartsCharts(stdout)
    expect(charts).toHaveLength(0)
  })

  it('should default invalid type to bar', () => {
    const stdout = `RECHARTS_JSON:{"type":"scatter","title":"Test","data":[{"x":1}],"xKey":"x","yKey":"x"}`
    const charts = parseRechartsCharts(stdout)
    expect(charts).toHaveLength(1)
    expect(charts[0].type).toBe('bar')
  })

  it('should return empty array when no RECHARTS_JSON in stdout', () => {
    const stdout = '결과: 매출 100억원\n행 1-50 기준'
    const charts = parseRechartsCharts(stdout)
    expect(charts).toHaveLength(0)
  })
})

describe('runAgentLoop', () => {
  let store: SessionStore
  const events: Array<{ type: string; data: unknown }> = []

  beforeEach(() => {
    store = new SessionStore(':memory:')
    events.length = 0
  })

  it('should emit plan event with steps', async () => {
    const result = await runAgentLoop(
      '매출 분석해줘',
      [{ name: 'sales.csv', columns: ['date', 'amount'], sample: [] }],
      [],
      null,
      [],
      'sales.csv: /path/to/sales.csv',
      '/outputs',
      'session-1',
      store,
      (e) => events.push(e),
    )

    const planEvent = events.find(e => e.type === 'plan')
    expect(planEvent).toBeDefined()

    const plan = planEvent!.data as { goal: string; steps: Array<{ description: string }> }
    expect(plan.goal).toBe('매출 분석')
    expect(plan.steps.length).toBeGreaterThanOrEqual(1)
  })

  it('should emit step_start and step_complete for each step', async () => {
    await runAgentLoop(
      '매출 분석해줘',
      [{ name: 'sales.csv', columns: ['date', 'amount'], sample: [] }],
      [],
      null,
      [],
      'sales.csv: /path/to/sales.csv',
      '/outputs',
      'session-1',
      store,
      (e) => events.push(e),
    )

    const starts = events.filter(e => e.type === 'step_start')
    const completes = events.filter(e => e.type === 'step_complete')
    expect(starts.length).toBeGreaterThanOrEqual(1)
    expect(completes.length).toBeGreaterThanOrEqual(1)
  })

  it('should emit synthesis with insight and citations', async () => {
    await runAgentLoop(
      '매출 분석해줘',
      [{ name: 'sales.csv', columns: ['date', 'amount'], sample: [] }],
      [],
      null,
      [],
      'sales.csv: /path/to/sales.csv',
      '/outputs',
      'session-1',
      store,
      (e) => events.push(e),
    )

    const synthesis = events.find(e => e.type === 'synthesis')
    expect(synthesis).toBeDefined()

    const data = synthesis!.data as { insight: string; citations: Array<{ text: string }> }
    expect(data.insight).toContain('Q4')
  })

  it('should emit follow_ups with questions', async () => {
    await runAgentLoop(
      '매출 분석해줘',
      [{ name: 'sales.csv', columns: ['date', 'amount'], sample: [] }],
      [],
      null,
      [],
      'sales.csv: /path/to/sales.csv',
      '/outputs',
      'session-1',
      store,
      (e) => events.push(e),
    )

    const followUps = events.find(e => e.type === 'follow_ups')
    expect(followUps).toBeDefined()

    const data = followUps!.data as { questions: string[] }
    expect(data.questions.length).toBeGreaterThanOrEqual(1)
  })

  it('should emit complete with full result', async () => {
    const result = await runAgentLoop(
      '매출 분석해줘',
      [{ name: 'sales.csv', columns: ['date', 'amount'], sample: [] }],
      [],
      null,
      [],
      'sales.csv: /path/to/sales.csv',
      '/outputs',
      'session-1',
      store,
      (e) => events.push(e),
    )

    expect(result.plan).toBeDefined()
    expect(result.insight).toBeDefined()
    expect(result.followUpQuestions).toBeDefined()

    const complete = events.find(e => e.type === 'complete')
    expect(complete).toBeDefined()
  })
})
