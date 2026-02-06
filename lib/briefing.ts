import { callClaude, MODEL_INTERPRET } from './claude'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import type { DataBriefing, DataProfile, ActionRecommendation } from './types'
import type { MetadataSummary } from './claude'
import { v4 as uuid } from 'uuid'

export function buildInferencePrompt(
  metadata: MetadataSummary[],
  profile: DataProfile | null,
): string {
  // 파일별 컬럼 + 샘플 2행만 전달 (토큰 절약)
  const metaStr = metadata.map(m =>
    `파일: ${m.name}\n컬럼: ${m.columns.join(', ')}\n샘플:\n${JSON.stringify(m.sample.slice(0, 2), null, 2)}`
  ).join('\n\n')

  // 전체 고유 컬럼 목록 (중복 제거)
  const allColumns = [...new Set(metadata.flatMap(m => m.columns))]

  const profileParts: string[] = []
  if (profile) {
    profileParts.push(`총 행 수: ${profile.totalRows}`)
    profileParts.push(`품질 점수: ${profile.qualityScore}/100`)
    if (profile.warnings.length > 0)
      profileParts.push(`경고: ${profile.warnings.map(w => `${w.column}: ${w.detail}`).join('; ')}`)
    if (profile.correlations.length > 0)
      profileParts.push(`상관관계: ${profile.correlations.map(c => `${c.col1}↔${c.col2}(${c.coefficient})`).join(', ')}`)
    if (profile.distributions.length > 0)
      profileParts.push(`주요 분포: ${profile.distributions.slice(0, 5).map(d => `${d.column}(평균 ${d.mean}, 중앙값 ${d.median})`).join(', ')}`)
  }

  return `${metaStr}\n\n전체 고유 컬럼(${allColumns.length}개): ${allColumns.join(', ')}${profileParts.length > 0 ? `\n\n통계 프로파일:\n${profileParts.join('\n')}` : ''}`
}

const INFERENCE_SYSTEM = `너는 데이터 분석 전문가이자 비즈니스 인사이트 컨설턴트야. CSV 메타데이터(컬럼명, 샘플 데이터, 통계)를 분석해서 이 데이터의 비즈니스 맥락을 깊이 있게 추론해.

규칙:
1. 파일명과 컬럼명에서 서비스/제품/산업 도메인을 추론해. GA4, 마케팅, 금융, 물류 등 구체적으로.
2. columnMeanings: 고유 컬럼 중 핵심 10개만 설명해. 나머지는 생략.
3. 샘플 데이터의 실제 값 패턴을 읽어서 구체적 인사이트를 제시해. (예: "page_view 236K vs scroll 84K → 스크롤 전환율 35%")
4. 이 데이터로 경영진이 의사결정할 수 있는 실질적 분석 질문 3개를 추천해. 질문은 구체적이고 액셔너블해야 함.
5. warnings는 데이터 품질이 아닌 비즈니스 관점 주의사항. (예: "총수익 컬럼이 모두 0 → 매출 추적이 미설정된 것으로 보임")
6. greeting은 마치 전문 데이터 분석가가 첫 미팅에서 하는 인사처럼 — 데이터를 이미 살펴본 느낌으로 2-3문장.
7. **actionRecommendations**: 데이터에서 발견한 패턴을 바탕으로 즉시 실행 가능한 구체적 액션 2-3개를 제안해.
   - action: "무엇을 해야 하는가" (구체적, 수치 포함)
   - expectedOutcome: "예상 결과" (정량적으로, 예: "ROAS 15% 개선")
   - reasoning: "왜 이 액션을 추천하는가" (데이터 근거)
   - impact: high/medium/low (비즈니스 영향도)
   - effort: low/medium/high (실행 난이도)
   - 가능하면 현재값(currentValue)과 목표값(targetValue)도 포함
8. 반드시 순수 JSON만 응답. 마크다운 코드블록(백틱) 절대 사용하지 마.

{
  "domain": "구체적 도메인 (예: 모바일 앱 분석 (Google Analytics 4 - 알트타운))",
  "briefing": "데이터 설명 2-4문장. 어떤 서비스의 어떤 기간 데이터이고, 핵심 지표가 무엇인지.",
  "columnMeanings": { "핵심컬럼명": "비즈니스 의미 (최대 10개만)" },
  "keyMetrics": ["가장 중요한 지표 컬럼명 3-5개"],
  "warnings": ["비즈니스 관점 주의사항 2-3개"],
  "suggestedQuestions": ["경영진/마케터가 물어볼 법한 구체적 분석 질문 3개"],
  "greeting": "전문 분석가 스타일 인사 + 데이터에서 즉시 발견한 인사이트 1개",
  "actionRecommendations": [
    {
      "action": "구체적 액션 (예: Meta Ads 예산 20% 증액)",
      "expectedOutcome": "예상 결과 (예: ROAS 15% 개선, 월 매출 2000만원 증가)",
      "reasoning": "데이터 근거 (예: 현재 Meta ROAS 6.23 > Google 5.26, 재구매율도 48% vs 29%)",
      "impact": "high",
      "effort": "low",
      "metric": "ROAS",
      "currentValue": "5.26",
      "targetValue": "6.0"
    }
  ]
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
      maxTokens: 4096,
      temperature: 0.3,
    })

    return parseInferenceResult(text, metadata)
  } catch (err) {
    console.error('[BRIEFING] API call failed:', err)
    return fallbackBriefing(metadata)
  }
}

export function parseInferenceResult(text: string, metadata?: MetadataSummary[]): DataBriefing {
  try {
    // 마크다운 코드블록 제거
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')

    // 흔한 JSON 오류 수정: trailing commas
    let jsonStr = jsonMatch[0]
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1')

    const parsed = JSON.parse(jsonStr)
    return {
      domain: parsed.domain ?? '',
      briefing: parsed.briefing ?? '',
      columnMeanings: parsed.columnMeanings ?? {},
      keyMetrics: parsed.keyMetrics ?? [],
      warnings: parsed.warnings ?? [],
      suggestedQuestions: parsed.suggestedQuestions ?? [],
      greeting: parsed.greeting ?? '',
      confirmed: false,
      actionRecommendations: parseActionRecommendations(parsed.actionRecommendations),
    }
  } catch (firstErr) {
    // JSON이 잘린 경우 복구 시도: 닫히지 않은 괄호 닫기
    try {
      let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      const startIdx = cleaned.indexOf('{')
      if (startIdx === -1) throw new Error('No JSON start')
      let partial = cleaned.slice(startIdx)
      // 잘린 문자열 값 닫기
      const quoteCount = (partial.match(/(?<!\\)"/g) || []).length
      if (quoteCount % 2 !== 0) partial += '"'
      // 열린 괄호 닫기
      const opens = (partial.match(/\{/g) || []).length
      const closes = (partial.match(/\}/g) || []).length
      for (let i = 0; i < opens - closes; i++) partial += '}'
      const openBrackets = (partial.match(/\[/g) || []).length
      const closeBrackets = (partial.match(/\]/g) || []).length
      for (let i = 0; i < openBrackets - closeBrackets; i++) partial += ']'
      partial = partial.replace(/,\s*([\]}])/g, '$1')
      const parsed = JSON.parse(partial)
      console.warn('[BRIEFING] JSON recovered from truncated response')
      return {
        domain: parsed.domain ?? '',
        briefing: parsed.briefing ?? '',
        columnMeanings: parsed.columnMeanings ?? {},
        keyMetrics: parsed.keyMetrics ?? [],
        warnings: parsed.warnings ?? [],
        suggestedQuestions: parsed.suggestedQuestions ?? [],
        greeting: parsed.greeting ?? '',
        confirmed: false,
        actionRecommendations: parseActionRecommendations(parsed.actionRecommendations),
      }
    } catch {
      console.error('[BRIEFING] JSON parse failed (unrecoverable):', firstErr, '\nRaw text:', text.slice(0, 500))
      return fallbackBriefing(metadata ?? [])
    }
  }
}

function parseActionRecommendations(raw: unknown): ActionRecommendation[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item: Record<string, unknown>) => ({
    id: uuid(),
    action: String(item.action ?? ''),
    expectedOutcome: String(item.expectedOutcome ?? ''),
    reasoning: String(item.reasoning ?? ''),
    impact: (['high', 'medium', 'low'].includes(String(item.impact)) ? item.impact : 'medium') as 'high' | 'medium' | 'low',
    effort: (['low', 'medium', 'high'].includes(String(item.effort)) ? item.effort : 'medium') as 'low' | 'medium' | 'high',
    metric: item.metric ? String(item.metric) : undefined,
    currentValue: item.currentValue ? String(item.currentValue) : undefined,
    targetValue: item.targetValue ? String(item.targetValue) : undefined,
  })).filter(a => a.action && a.expectedOutcome)
}

function fallbackBriefing(metadata: MetadataSummary[]): DataBriefing {
  const names = metadata.map(m => m.name).filter(Boolean)
  const label = names.length > 0 ? names.join(', ') : '데이터'
  return {
    domain: '',
    briefing: `${label} 파일을 분석할 준비가 됐습니다.`,
    columnMeanings: {},
    keyMetrics: [],
    warnings: [],
    suggestedQuestions: [],
    greeting: `${label} 데이터를 받았습니다. 어떤 분석을 해드릴까요?`,
    confirmed: false,
    actionRecommendations: [],
  }
}
