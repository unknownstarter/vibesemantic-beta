import { v4 as uuid } from 'uuid'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { callClaude, extractPythonCode, MODEL_CODE_GEN, MODEL_INTERPRET, type MetadataSummary } from './claude'
import { validateCode, executePython } from './executor'
import { cacheResults, buildCacheContext, buildLearnedContextString } from './context'
import { buildPlannerSystem, buildStepCoderSystem, buildSynthesizerSystem } from './prompts'
import type {
  AnalysisPlan, AnalysisStep, AgentEvent, AgentResult,
  ChartData, Citation, AnalysisCache, LearnedContext,
} from './types'
import type { SessionStore } from './sessions'

function withCacheControl(text: string): TextBlockParam {
  return { type: 'text', text, cache_control: { type: 'ephemeral' } } as TextBlockParam
}

// Parse RECHARTS_JSON: lines from Python stdout
export function parseRechartsCharts(stdout: string): ChartData[] {
  const charts: ChartData[] = []
  const lines = stdout.split('\n')
  for (const line of lines) {
    const idx = line.indexOf('RECHARTS_JSON:')
    if (idx === -1) continue
    try {
      const json = JSON.parse(line.slice(idx + 'RECHARTS_JSON:'.length))
      const type = ['bar', 'line', 'pie', 'summary'].includes(json.type) ? json.type : 'bar'
      if (Array.isArray(json.data) && json.data.length > 0) {
        charts.push({
          id: uuid(),
          type: type as ChartData['type'],
          title: json.title || 'Chart',
          data: json.data,
          xKey: json.xKey,
          yKey: json.yKey,
          insight: json.insight || undefined,
          source: 'Chat Analysis',
        })
      }
    } catch { /* skip malformed JSON */ }
  }
  return charts
}

// Build ChartData from both Recharts JSON and generated image files
function buildChartsFromResult(
  stdout: string,
  generatedFiles: string[],
  title: string,
): ChartData[] {
  // 1. Recharts JSON charts (priority)
  const rechartsCharts = parseRechartsCharts(stdout)

  // 2. Image-based charts (fallback for complex visualizations)
  const imageCharts: ChartData[] = generatedFiles
    .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
    .map(f => ({
      id: uuid(),
      type: 'bar' as const,
      title,
      data: [],
      imageUrl: `/api/outputs/${f}`,
      source: 'Chat Analysis',
    }))

  return [...rechartsCharts, ...imageCharts]
}

// ========== 1. Plan ==========

async function planAnalysis(
  question: string,
  dataContext: string,
  cacheContext: string,
): Promise<{ goal: string; steps: Array<{ order: number; description: string }> }> {
  const system = buildPlannerSystem(dataContext, cacheContext || undefined)
  const text = await callClaude({
    model: MODEL_INTERPRET, // Haiku for planning (fast + cheap)
    systemBlocks: [withCacheControl(system)],
    messages: [{ role: 'user', content: question }],
    maxTokens: 1024,
    temperature: 0,
  })

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch { /* fallthrough */ }

  // Fallback: single-step plan
  return {
    goal: question,
    steps: [{ order: 1, description: question }],
  }
}

// ========== 2. Execute Step ==========

async function executeStep(
  step: AnalysisStep,
  metadata: MetadataSummary[],
  filePathContext: string,
  cacheContext: string,
  learnedContextStr: string,
  outputsDir: string,
): Promise<{ code: string; stdout: string; stderr: string; exitCode: number; generatedFiles: string[] }> {
  const dataContext = metadata.map(m =>
    `파일: ${m.name}\n컬럼: ${m.columns.join(', ')}\n샘플:\n${JSON.stringify(m.sample.slice(0, 3), null, 2)}`
  ).join('\n\n')

  const system = buildStepCoderSystem(dataContext, cacheContext || undefined, learnedContextStr || undefined)

  const prompt = `${step.description}\n\n파일 경로:\n${filePathContext}\n\n시각화 시 RECHARTS_JSON으로 출력해. 복잡한 시각화(히트맵, 산점도 등)만 matplotlib 사용 — 저장 경로: ${outputsDir}/${uuid()}.png`

  const text = await callClaude({
    model: MODEL_CODE_GEN,
    systemBlocks: [withCacheControl(system)],
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4096,
    temperature: 0,
  })

  const code = extractPythonCode(text)
  const validation = validateCode(code)

  if (!validation.safe) {
    return { code, stdout: '', stderr: `보안 검증 실패: ${validation.reason}`, exitCode: 1, generatedFiles: [] }
  }

  let result = await executePython(code, process.cwd(), 30000)

  // Retry once on failure
  if (result.exitCode !== 0) {
    const retryPrompt = `이전 코드 실행이 실패했어. 에러를 수정해줘.\n\n이전 코드:\n\`\`\`python\n${code}\n\`\`\`\n\n에러:\n${result.stderr}\n\n파일 경로:\n${filePathContext}`
    const retryText = await callClaude({
      model: MODEL_CODE_GEN,
      systemBlocks: [withCacheControl(system)],
      messages: [{ role: 'user', content: retryPrompt }],
      maxTokens: 4096,
      temperature: 0,
    })
    const retryCode = extractPythonCode(retryText)
    const retryValidation = validateCode(retryCode)
    if (retryValidation.safe) {
      result = await executePython(retryCode, process.cwd(), 30000)
      return { code: retryCode, ...result }
    }
  }

  return { code, ...result }
}

// ========== 3. Synthesize ==========

async function synthesize(
  question: string,
  stepResults: Array<{ description: string; stdout: string }>,
  learnedContextStr: string,
): Promise<{ insight: string; citations: Citation[]; followUpQuestions: string[] }> {
  const system = buildSynthesizerSystem(learnedContextStr || undefined)

  const stepsText = stepResults.map((r, i) =>
    `단계 ${i + 1}: ${r.description}\n결과:\n${r.stdout.slice(0, 3000)}`
  ).join('\n\n---\n\n')

  const text = await callClaude({
    model: MODEL_CODE_GEN, // Sonnet for synthesis (quality)
    systemBlocks: [withCacheControl(system)],
    messages: [{
      role: 'user',
      content: `사용자 질문: ${question}\n\n분석 결과:\n${stepsText}`,
    }],
    maxTokens: 2048,
    temperature: 0.3,
  })

  // Parse follow-up questions from JSON block
  let followUpQuestions: string[] = []
  try {
    const jsonMatch = text.match(/```json\n([\s\S]*?)```/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1])
      followUpQuestions = parsed.followUpQuestions ?? []
    }
  } catch { /* ignore */ }

  // Extract citations (simplified: look for patterns like "행 N-M", "N건")
  const citations: Citation[] = []
  const citationPattern = /행\s*(\d+)-(\d+)/g
  let citMatch
  while ((citMatch = citationPattern.exec(text)) !== null) {
    citations.push({
      text: citMatch[0],
      rowRange: [parseInt(citMatch[1]), parseInt(citMatch[2])],
    })
  }

  // Remove JSON block from insight
  const insight = text.replace(/```json\n[\s\S]*?```/g, '').trim()

  return { insight, citations, followUpQuestions }
}

// ========== Fast Path ==========

interface FastPathClassification {
  isFastPath: boolean
  type: 'simple' | 'direct_lookup' | 'cached_replay' | 'aggregation' | 'none'
  reason: string
}

function classifyQuery(
  question: string,
  metadata: MetadataSummary[],
  history: Array<{ role: string; content: string }>,
): FastPathClassification {
  // Extended simple patterns (50%+ coverage target)
  const simplePatterns = [
    // 기존 패턴
    /평균|mean|average/i, /합계|sum|total/i,
    /최대|최소|max|min/i, /개수|count|몇/i,
    /분포|distribution/i, /상관|correlation/i,
    /비율|percentage/i, /그룹|group/i,
    /요약|describe|summary/i, /표준편차|std/i,
    // 확장 패턴
    /비교|compare/i, /추이|trend/i, /순위|rank|top/i,
    /보여|show|display/i, /리스트|list/i,
    /얼마|몇\s*(개|건|명|원)/i, /몇\s*%/i,
    /가장|제일/i, /상위|하위|top\s*\d+|bottom\s*\d+/i,
    /총|전체/i, /증가|감소|변화/i,
    /월별|일별|연도별|년별|분기별/i,
    /카테고리별|유형별|종류별/i,
    // 추가 패턴 (v2)
    /알려줘|알려\s*줄래/i, /뭐야|뭔가요/i,
    /어때|어떻|어떤/i, /있어|있나요|있는지/i,
    /높은|낮은|큰|작은/i, /많은|적은/i,
    /차이|격차|갭/i, /성장|하락|상승|감소율/i,
    /데이터|값|수치/i, /통계/i,
  ]

  // Direct lookup patterns: 특정 값 조회 ("A의 B는?", "X 값 알려줘")
  const directLookupPatterns = [
    /(.+)의\s*(.+)[은는이가]\s*(뭐|무엇|얼마)/i,
    /(.+)\s*값\s*(알려|보여|확인)/i,
    /(.+)\s*(조회|검색|찾아)/i,
    /(.+)[은는이가]\s*얼마/i,
    /(.+)\s*어디/i,
  ]

  // Cached replay patterns: 이전 분석 참조 ("아까", "방금", "위에")
  const cachedReplayPatterns = [
    /아까|방금|이전|위에|앞서/i,
    /그\s*(결과|분석|차트)/i,
    /다시\s*(보여|확인)/i,
    /같은\s*(분석|차트)/i,
  ]

  // Aggregation patterns: 집계 쿼리 (단일 연산, 파일 수 무관)
  const aggregationPatterns = [
    /^(총|전체|모든).*(합계|개수|평균|합|수)/i,
    /전체\s*(매출|수익|판매|금액)/i,
    /총\s*(건수|개수|수량)/i,
    /데이터\s*(요약|개요|현황)/i,
  ]

  const isSimple = simplePatterns.some(p => p.test(question))
  const isDirectLookup = directLookupPatterns.some(p => p.test(question))
  const isCachedReplay = cachedReplayPatterns.some(p => p.test(question)) && history.length > 0
  const isAggregation = aggregationPatterns.some(p => p.test(question))

  // 조건 완화: 200자, history 6턴, 파일 3개까지
  const isFewFiles = metadata.length <= 3
  const isSingleFile = metadata.length <= 1
  const isShort = question.length < 200
  const isMediumLength = question.length < 300
  const isEarlyConversation = history.length <= 6

  // Fast Path 우선순위: cached_replay > aggregation > direct_lookup > simple
  if (isCachedReplay && isShort) {
    console.log('[FAST_PATH] cached_replay:', question.slice(0, 50))
    return { isFastPath: true, type: 'cached_replay', reason: '이전 분석 참조' }
  }

  if (isAggregation && isFewFiles && isMediumLength) {
    console.log('[FAST_PATH] aggregation:', question.slice(0, 50))
    return { isFastPath: true, type: 'aggregation', reason: '전체 집계 쿼리' }
  }

  if (isDirectLookup && isFewFiles && isShort) {
    console.log('[FAST_PATH] direct_lookup:', question.slice(0, 50))
    return { isFastPath: true, type: 'direct_lookup', reason: '단일 값 조회' }
  }

  if (isSimple && isSingleFile && isShort && isEarlyConversation) {
    console.log('[FAST_PATH] simple:', question.slice(0, 50))
    return { isFastPath: true, type: 'simple', reason: '단순 통계 쿼리' }
  }

  // 완화된 simple 조건: 파일 3개 이하 + 짧은 질문 + 단순 패턴
  if (isSimple && isFewFiles && isShort) {
    console.log('[FAST_PATH] simple_relaxed:', question.slice(0, 50))
    return { isFastPath: true, type: 'simple', reason: '단순 통계 쿼리 (완화)' }
  }

  return { isFastPath: false, type: 'none', reason: '' }
}

async function runFastPath(
  question: string,
  metadata: MetadataSummary[],
  filePathContext: string,
  outputsDir: string,
  onEvent: (event: AgentEvent) => void,
): Promise<AgentResult> {
  const startTime = Date.now()
  const stepId = uuid()
  const planId = uuid()

  // Single-step plan
  const plan: AnalysisPlan = {
    id: planId,
    goal: question,
    steps: [{ id: stepId, order: 1, description: question, status: 'running' as const }],
    status: 'executing',
  }
  onEvent({ type: 'plan', data: plan })
  onEvent({ type: 'step_start', data: { stepId, description: question } })

  // Generate code with Haiku (fast + cheap)
  const dataContext = metadata.map(m =>
    `파일: ${m.name}\n컬럼: ${m.columns.join(', ')}\n샘플:\n${JSON.stringify(m.sample.slice(0, 3), null, 2)}`
  ).join('\n\n')

  const system = buildStepCoderSystem(dataContext)
  const prompt = `${question}\n\n파일 경로:\n${filePathContext}\n\n시각화 시 RECHARTS_JSON으로 출력해. 복잡한 시각화(히트맵, 산점도 등)만 matplotlib 사용 — 저장 경로: ${outputsDir}/${uuid()}.png`

  console.log('[FAST_PATH] Generating code with Haiku...')
  const text = await callClaude({
    model: MODEL_INTERPRET, // Haiku for fast path
    systemBlocks: [withCacheControl(system)],
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2048,
    temperature: 0,
  })
  console.log(`[FAST_PATH] Code generated in ${Date.now() - startTime}ms`)

  const code = extractPythonCode(text)
  const validation = validateCode(code)

  if (!validation.safe) {
    plan.steps[0].status = 'failed'
    plan.status = 'failed'
    const insight = `보안 검증 실패: ${validation.reason}`
    onEvent({ type: 'synthesis', data: { insight, citations: [] } })
    onEvent({ type: 'complete', data: { plan, insight, citations: [], charts: [], followUpQuestions: [] } })
    return { plan, insight, citations: [], charts: [], followUpQuestions: [] }
  }

  // Execute with timeout (8s for slightly complex queries)
  console.log('[FAST_PATH] Executing Python code...')
  const result = await executePython(code, process.cwd(), 8000)
  console.log(`[FAST_PATH] Total time: ${Date.now() - startTime}ms, exit: ${result.exitCode}`)

  const charts = buildChartsFromResult(result.stdout, result.generatedFiles, question)

  plan.steps[0].status = result.exitCode === 0 ? 'success' : 'failed'
  plan.steps[0].code = code
  plan.steps[0].result = {
    stdout: result.stdout,
    generatedFiles: result.generatedFiles,
    cachedFiles: [],
    summary: result.stdout.slice(0, 500),
  }
  plan.status = result.exitCode === 0 ? 'complete' : 'failed'

  onEvent({
    type: 'step_complete',
    data: {
      stepId,
      result: plan.steps[0].result,
      charts: charts.length > 0 ? charts : undefined,
    },
  })

  // Use stdout directly as insight (skip synthesize LLM call), strip RECHARTS_JSON lines
  const cleanStdout = result.stdout.split('\n').filter(l => !l.includes('RECHARTS_JSON:')).join('\n').trim()
  const insight = result.exitCode === 0
    ? cleanStdout.slice(0, 3000) || '분석이 완료되었습니다.'
    : `실행 실패: ${result.stderr.slice(0, 500)}`

  onEvent({ type: 'synthesis', data: { insight, citations: [] } })
  onEvent({ type: 'follow_ups', data: { questions: [] } })

  const agentResult: AgentResult = {
    plan,
    insight,
    citations: [],
    charts,
    followUpQuestions: [],
  }

  onEvent({ type: 'complete', data: agentResult })
  return agentResult
}

// ========== Main Agent Loop ==========

export async function runAgentLoop(
  question: string,
  metadata: MetadataSummary[],
  caches: AnalysisCache[],
  context: LearnedContext | null,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  filePathContext: string,
  outputsDir: string,
  sessionId: string,
  store: SessionStore,
  onEvent: (event: AgentEvent) => void,
): Promise<AgentResult> {
  // Fast path: 간단 쿼리는 Haiku 1회 호출로 처리
  // 캐시가 있어도 cached_replay, aggregation, direct_lookup은 Fast Path 사용
  const classification = classifyQuery(question, metadata, history)
  const allowFastPathWithCache = ['cached_replay', 'aggregation', 'direct_lookup'].includes(classification.type)
  if (classification.isFastPath && (caches.length === 0 || allowFastPathWithCache)) {
    console.log(`[AGENT] Fast Path activated: ${classification.type} - ${classification.reason}`)
    return runFastPath(question, metadata, filePathContext, outputsDir, onEvent)
  }

  const cacheContext = buildCacheContext(caches)
  const learnedContextStr = buildLearnedContextString(context)
  const dataContext = metadata.map(m =>
    `파일: ${m.name}\n컬럼: ${m.columns.join(', ')}\n샘플:\n${JSON.stringify(m.sample.slice(0, 3), null, 2)}`
  ).join('\n\n')

  // 1. Plan
  const planResult = await planAnalysis(question, dataContext, cacheContext)

  const plan: AnalysisPlan = {
    id: uuid(),
    goal: planResult.goal,
    steps: planResult.steps.map((s, i) => ({
      id: uuid(),
      order: s.order ?? i + 1,
      description: s.description,
      status: 'pending' as const,
    })),
    status: 'executing',
  }

  onEvent({ type: 'plan', data: plan })

  // 2. Execute each step
  const allCharts: ChartData[] = []
  const stepResults: Array<{ description: string; stdout: string }> = []

  for (const step of plan.steps) {
    step.status = 'running'
    onEvent({ type: 'step_start', data: { stepId: step.id, description: step.description } })

    try {
      const result = await executeStep(
        step, metadata, filePathContext, cacheContext, learnedContextStr, outputsDir
      )

      step.code = result.code
      step.result = {
        stdout: result.stdout,
        generatedFiles: result.generatedFiles,
        cachedFiles: [],
        summary: result.stdout.slice(0, 500),
      }

      // Cache intermediate results
      const newCaches = await cacheResults(sessionId, result.stdout, store)
      step.result.cachedFiles = newCaches.map(c => c.filePath)

      // Build charts from Recharts JSON + image fallback
      const stepCharts = buildChartsFromResult(result.stdout, result.generatedFiles, step.description)
      allCharts.push(...stepCharts)

      step.status = result.exitCode === 0 ? 'success' : 'failed'

      onEvent({
        type: 'step_complete',
        data: {
          stepId: step.id,
          result: step.result,
          charts: stepCharts.length > 0 ? stepCharts : undefined,
        },
      })

      // Strip RECHARTS_JSON lines before passing to synthesizer
      const cleanStdout = result.stdout.split('\n').filter(l => !l.includes('RECHARTS_JSON:')).join('\n').trim()
      stepResults.push({ description: step.description, stdout: cleanStdout })
    } catch (err) {
      step.status = 'failed'
      step.result = {
        stdout: '',
        generatedFiles: [],
        cachedFiles: [],
        summary: String(err),
      }
      onEvent({ type: 'error', data: { message: `Step ${step.order} failed: ${String(err)}` } })
    }
  }

  // 3. Synthesize
  const { insight, citations, followUpQuestions } = await synthesize(
    question, stepResults, learnedContextStr
  )

  plan.status = plan.steps.every(s => s.status === 'success') ? 'complete' : 'failed'

  onEvent({ type: 'synthesis', data: { insight, citations } })
  onEvent({ type: 'follow_ups', data: { questions: followUpQuestions } })

  const agentResult: AgentResult = {
    plan,
    insight,
    citations,
    charts: allCharts,
    followUpQuestions,
  }

  onEvent({ type: 'complete', data: agentResult })

  return agentResult
}
