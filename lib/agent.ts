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

  const prompt = `${step.description}\n\n파일 경로:\n${filePathContext}\n\n차트 생성 시 저장 경로: ${outputsDir}/${uuid()}.png`

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

      // Build charts from generated images
      const stepCharts: ChartData[] = result.generatedFiles
        .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
        .map(f => ({
          id: uuid(),
          type: 'bar' as const,
          title: step.description,
          data: [],
          imageUrl: `/api/outputs/${f}`,
        }))
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

      stepResults.push({ description: step.description, stdout: result.stdout })
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
