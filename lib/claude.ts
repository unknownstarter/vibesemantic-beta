import Anthropic from '@anthropic-ai/sdk'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages'

// Model constants
export const MODEL_CODE_GEN = 'claude-sonnet-4-20250514'
export const MODEL_INTERPRET = 'claude-haiku-4-5-20251001'

const CODE_GEN_SYSTEM = `너는 데이터 분석 에이전트야. 사용자의 질문에 Python 코드로 답변해.

규칙:
1. pandas로 CSV를 읽어서 분석해. 파일 경로는 제공된 경로를 사용해.
2. 결과는 반드시 print()로 출력해.
3. 차트가 필요하면 matplotlib로 생성하고 지정된 경로에 저장해. plt.savefig(output_path)를 사용하고 plt.close()를 호출해.
4. 한글 폰트 설정: plt.rcParams['font.family'] = 'AppleGothic' (macOS)
5. 코드만 출력해. 설명은 붙이지 마.
6. 출력 이미지 경로 형식: outputs/{uuid}.png`

const INTERPRET_SYSTEM = `너는 데이터 분석 에이전트야. 코드 실행 결과를 사용자에게 설명해.

규칙:
1. 핵심 수치를 먼저 말해.
2. 인사이트나 이상한 점이 있으면 언급해.
3. 간결하게 한국어로 답변해.
4. 차트가 생성되었으면 어떤 차트인지 설명해.`

interface MetadataSummary {
  name: string
  columns: string[]
  sample: Record<string, unknown>[]
}

interface BuildResult {
  system: string
  systemBlocks: TextBlockParam[]
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

function withCacheControl(text: string): TextBlockParam {
  return {
    type: 'text',
    text,
    cache_control: { type: 'ephemeral' },
  } as TextBlockParam
}

export function buildCodeGenMessages(
  metadata: MetadataSummary[],
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  question: string
): BuildResult {
  const dataContext = metadata.map(m =>
    `파일: ${m.name}\n컬럼: ${m.columns.join(', ')}\n샘플:\n${JSON.stringify(m.sample.slice(0, 3), null, 2)}`
  ).join('\n\n')

  const system = `${CODE_GEN_SYSTEM}\n\n사용 가능한 데이터:\n${dataContext}`

  const systemBlocks: TextBlockParam[] = [
    withCacheControl(CODE_GEN_SYSTEM),
    withCacheControl(`사용 가능한 데이터:\n${dataContext}`),
  ]

  const messages = [
    ...history,
    { role: 'user' as const, content: question },
  ]

  return { system, systemBlocks, messages }
}

export function buildInterpretMessages(
  executionOutput: string,
  originalQuestion: string
): BuildResult {
  return {
    system: INTERPRET_SYSTEM,
    systemBlocks: [withCacheControl(INTERPRET_SYSTEM)],
    messages: [
      {
        role: 'user',
        content: `사용자 질문: ${originalQuestion}\n\n코드 실행 결과:\n${executionOutput}`,
      },
    ],
  }
}

export function extractPythonCode(text: string): string {
  const match = text.match(/```python\n([\s\S]*?)```/)
  if (match) return match[1].trim()
  const generic = text.match(/```\n([\s\S]*?)```/)
  if (generic) return generic[1].trim()
  return text.trim()
}

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

export async function generateCode(
  metadata: MetadataSummary[],
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  question: string
): Promise<string> {
  const { systemBlocks, messages } = buildCodeGenMessages(metadata, history, question)
  const anthropic = getClient()

  const response = await anthropic.messages.create({
    model: MODEL_CODE_GEN,
    max_tokens: 4096,
    system: systemBlocks,
    messages,
    temperature: 0,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return extractPythonCode(text)
}

export async function interpretResult(
  executionOutput: string,
  originalQuestion: string
): Promise<string> {
  const { systemBlocks, messages } = buildInterpretMessages(executionOutput, originalQuestion)
  const anthropic = getClient()

  const response = await anthropic.messages.create({
    model: MODEL_INTERPRET,
    max_tokens: 2048,
    system: systemBlocks,
    messages,
    temperature: 0.3,
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
