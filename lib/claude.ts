import Anthropic from '@anthropic-ai/sdk'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { buildStepCoderSystem, buildSynthesizerSystem } from './prompts'

// Model constants
export const MODEL_CODE_GEN = 'claude-sonnet-4-20250514'
export const MODEL_INTERPRET = 'claude-haiku-4-5-20251001'

function withCacheControl(text: string): TextBlockParam {
  return {
    type: 'text',
    text,
    cache_control: { type: 'ephemeral' },
  } as TextBlockParam
}

export interface MetadataSummary {
  name: string
  columns: string[]
  sample: Record<string, unknown>[]
}

interface BuildResult {
  system: string
  systemBlocks: TextBlockParam[]
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

// ========== 범용 Claude API 래퍼 ==========

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

export async function callClaude(options: {
  model: string
  systemBlocks: TextBlockParam[]
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
  temperature?: number
}): Promise<string> {
  const anthropic = getClient()
  const response = await anthropic.messages.create({
    model: options.model,
    max_tokens: options.maxTokens ?? 4096,
    system: options.systemBlocks,
    messages: options.messages,
    temperature: options.temperature ?? 0,
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}

// ========== 데이터 컨텍스트 빌더 ==========

function buildDataContext(metadata: MetadataSummary[]): string {
  return metadata.map(m =>
    `파일: ${m.name}\n컬럼: ${m.columns.join(', ')}\n샘플:\n${JSON.stringify(m.sample.slice(0, 3), null, 2)}`
  ).join('\n\n')
}

// ========== 코드 생성 ==========

export function buildCodeGenMessages(
  metadata: MetadataSummary[],
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  question: string,
  cacheContext?: string,
  learnedContext?: string
): BuildResult {
  const dataContext = buildDataContext(metadata)
  const system = buildStepCoderSystem(dataContext, cacheContext, learnedContext)

  const systemBlocks: TextBlockParam[] = [
    withCacheControl(buildStepCoderSystem('')),
    withCacheControl(`사용 가능한 데이터:\n${dataContext}${cacheContext ? '\n\n' + cacheContext : ''}${learnedContext ? '\n\n비즈니스 컨텍스트:\n' + learnedContext : ''}`),
  ]

  const messages = [
    ...history,
    { role: 'user' as const, content: question },
  ]

  return { system, systemBlocks, messages }
}

export async function generateCode(
  metadata: MetadataSummary[],
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  question: string,
  cacheContext?: string,
  learnedContext?: string
): Promise<string> {
  const { systemBlocks, messages } = buildCodeGenMessages(metadata, history, question, cacheContext, learnedContext)

  const text = await callClaude({
    model: MODEL_CODE_GEN,
    systemBlocks,
    messages,
    maxTokens: 4096,
    temperature: 0,
  })

  return extractPythonCode(text)
}

// ========== 결과 해석 ==========

export function buildInterpretMessages(
  executionOutput: string,
  originalQuestion: string,
  learnedContext?: string
): BuildResult {
  const system = buildSynthesizerSystem(learnedContext)
  return {
    system,
    systemBlocks: [withCacheControl(system)],
    messages: [
      {
        role: 'user',
        content: `사용자 질문: ${originalQuestion}\n\n코드 실행 결과:\n${executionOutput}`,
      },
    ],
  }
}

export async function interpretResult(
  executionOutput: string,
  originalQuestion: string,
  learnedContext?: string
): Promise<string> {
  const { systemBlocks, messages } = buildInterpretMessages(executionOutput, originalQuestion, learnedContext)

  return callClaude({
    model: MODEL_INTERPRET,
    systemBlocks,
    messages,
    maxTokens: 2048,
    temperature: 0.3,
  })
}

// ========== 대화 이력 압축 ==========

const COMPRESS_THRESHOLD = 10 // 10메시지 초과 시 압축
const KEEP_RECENT = 10 // 최근 10메시지(5턴) 유지

export async function compressHistory(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  sessionId: string | undefined,
  store: { getSummary: (id: string) => { summary: string; coveredCount: number } | null; saveSummary: (id: string, summary: string, count: number) => void } | null,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (history.length <= COMPRESS_THRESHOLD) return history

  const toCompress = history.slice(0, history.length - KEEP_RECENT)
  const recent = history.slice(history.length - KEEP_RECENT)

  // Check cached summary
  if (sessionId && store) {
    const cached = store.getSummary(sessionId)
    if (cached && cached.coveredCount >= toCompress.length) {
      return [
        { role: 'assistant', content: `[이전 대화 요약]\n${cached.summary}` },
        ...recent,
      ]
    }
  }

  // Build summary using Haiku
  const conversationText = toCompress
    .map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content.slice(0, 500)}`)
    .join('\n')

  const summary = await callClaude({
    model: MODEL_INTERPRET,
    systemBlocks: [withCacheControl(
      '너는 대화 요약 전문가야. 이전 대화를 3-5문장으로 요약해. 핵심 분석 결과, 발견사항, 사용자의 관심사를 중심으로 요약해. 한국어로.'
    )],
    messages: [{ role: 'user', content: `다음 대화를 요약해:\n\n${conversationText}` }],
    maxTokens: 512,
    temperature: 0,
  })

  // Cache the summary
  if (sessionId && store) {
    store.saveSummary(sessionId, summary, toCompress.length)
  }

  return [
    { role: 'assistant', content: `[이전 대화 요약]\n${summary}` },
    ...recent,
  ]
}

// ========== 유틸 ==========

export function extractPythonCode(text: string): string {
  const match = text.match(/```python\n([\s\S]*?)```/)
  if (match) return match[1].trim()
  const generic = text.match(/```\n([\s\S]*?)```/)
  if (generic) return generic[1].trim()
  return text.trim()
}
