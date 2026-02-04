import { callClaude, MODEL_INTERPRET } from './claude'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import type { DataBriefing, DataProfile } from './types'
import type { MetadataSummary } from './claude'

export function buildInferencePrompt(
  metadata: MetadataSummary[],
  profile: DataProfile | null,
): string {
  const metaStr = metadata.map(m =>
    `파일: ${m.name}\n컬럼: ${m.columns.join(', ')}\n샘플 데이터:\n${JSON.stringify(m.sample.slice(0, 5), null, 2)}`
  ).join('\n\n')

  const profileStr = profile
    ? `행 수: ${profile.totalRows}, 품질 점수: ${profile.qualityScore}/100, 경고: ${profile.warnings.map(w => `${w.column}: ${w.detail}`).join('; ')}, 상관관계: ${profile.correlations.map(c => `${c.col1}↔${c.col2}(${c.coefficient})`).join(', ')}`
    : ''

  return `${metaStr}\n\n통계 프로파일:\n${profileStr}`
}

const INFERENCE_SYSTEM = `너는 데이터 분석 전문가야. CSV 메타데이터(컬럼명, 샘플 데이터, 통계)를 보고 이 데이터가 어떤 서비스/비즈니스의 데이터인지 추론해.

규칙:
1. 컬럼명과 샘플 값으로 도메인을 추론해. 확실하지 않으면 가장 유력한 추측을 해.
2. 각 컬럼의 비즈니스 의미를 추론해.
3. 이상치/경고를 도메인 관점에서 재해석해 (예: 투자 데이터의 이상치는 대형 종목 때문일 수 있음).
4. 이 데이터로 할 수 있는 의미 있는 분석 3개를 추천해.
5. 간결한 한국어로.
6. JSON으로만 응답해:

{
  "domain": "도메인 이름",
  "briefing": "1-3문장 데이터 설명",
  "columnMeanings": { "컬럼명": "비즈니스 의미" },
  "keyMetrics": ["핵심 지표 컬럼명"],
  "warnings": ["도메인 관점 경고 해석"],
  "suggestedQuestions": ["추천 분석 질문 3개"],
  "greeting": "ResearchPanel AI 인사말 (데이터 이해를 보여주는 1-2문장)"
}`

export async function inferContext(
  metadata: MetadataSummary[],
  profile: DataProfile | null,
): Promise<DataBriefing> {
  const prompt = buildInferencePrompt(metadata, profile)

  try {
    const text = await callClaude({
      model: MODEL_INTERPRET,
      systemBlocks: [{ type: 'text', text: INFERENCE_SYSTEM } as TextBlockParam],
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1024,
      temperature: 0.3,
    })

    return parseInferenceResult(text)
  } catch {
    return fallbackBriefing(metadata)
  }
}

export function parseInferenceResult(text: string): DataBriefing {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0])
    return {
      domain: parsed.domain ?? '',
      briefing: parsed.briefing ?? '',
      columnMeanings: parsed.columnMeanings ?? {},
      keyMetrics: parsed.keyMetrics ?? [],
      warnings: parsed.warnings ?? [],
      suggestedQuestions: parsed.suggestedQuestions ?? [],
      greeting: parsed.greeting ?? '',
      confirmed: false,
    }
  } catch {
    return fallbackBriefing([])
  }
}

function fallbackBriefing(metadata: MetadataSummary[]): DataBriefing {
  const name = metadata[0]?.name ?? '데이터'
  return {
    domain: '',
    briefing: `${name} 데이터를 분석할 준비가 됐습니다.`,
    columnMeanings: {},
    keyMetrics: [],
    warnings: [],
    suggestedQuestions: [],
    greeting: `${name} 데이터를 받았습니다. 어떤 분석을 해드릴까요?`,
    confirmed: false,
  }
}
