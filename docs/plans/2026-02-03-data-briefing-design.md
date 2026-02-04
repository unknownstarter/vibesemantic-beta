# Data Briefing (Infer-Then-Confirm) 구현 플랜

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** CSV 업로드 직후 AI가 데이터의 비즈니스 맥락을 추론하고, 사용자에게 확인/수정을 받은 뒤 정확한 컨텍스트 기반으로 분석을 시작하는 "Infer-Then-Confirm" 온보딩 경험을 구현한다.

**Architecture:** 업로드 API에서 기존 Smart Profile 후 Haiku 1회 호출로 도메인/컬럼 의미/브리핑을 추론. 프론트엔드에서 DataBriefingCard로 추론 결과를 표시하고 [맞아요/수정] UI 제공. 확인 즉시 ResearchPanel이 자동 열리며 AI 인사말 표시. 확정된 컨텍스트는 LearnedContext에 저장되어 이후 모든 분석에서 참조됨.

**Tech Stack:** Claude Haiku (추론), React (DataBriefingCard), 기존 LearnedContext/SessionStore (저장)

---

## Task 1: DataBriefing 타입 정의

**Files:**
- Modify: `lib/types.ts`

**Step 1: DataBriefing 인터페이스 추가**

`lib/types.ts` 파일 끝 (`ExportFormat` 아래)에 추가:

```typescript
// ========== Data Briefing (Infer-Then-Confirm) ==========

export interface DataBriefing {
  domain: string                          // "VTuber 가치 거래"
  briefing: string                        // 1-3문장 자연어 브리핑
  columnMeanings: Record<string, string>  // { "알트ID": "VTuber 캐릭터 식별자" }
  keyMetrics: string[]                    // ["수익률", "투자액"]
  warnings: string[]                      // 도메인 관점 경고 해석
  suggestedQuestions: string[]            // ["인기 알트 TOP 10", ...]
  greeting: string                        // ResearchPanel AI 첫 메시지
  confirmed: boolean                      // 사용자 확인 여부
}
```

**Step 2: UploadResult에 briefing 필드 추가**

기존 `UploadResult` 인터페이스에 `briefing` 필드 추가:

```typescript
export interface UploadResult {
  files: FileMetadata[]
  charts: ChartData[]
  profile?: DataProfile
  quickActions?: QuickAction[]
  briefing?: DataBriefing              // ← 추가
}
```

**Step 3: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 4: 커밋**

```bash
git add lib/types.ts
git commit -m "feat: add DataBriefing type for Infer-Then-Confirm"
```

---

## Task 2: Context Inference 함수 구현

**Files:**
- Create: `lib/briefing.ts`
- Create: `__tests__/lib/briefing.test.ts`

**Step 1: 테스트 작성**

```typescript
// __tests__/lib/briefing.test.ts
import { describe, it, expect } from 'vitest'
import { buildInferencePrompt, parseInferenceResult } from '@/lib/briefing'

describe('buildInferencePrompt', () => {
  it('should build prompt from metadata and profile', () => {
    const prompt = buildInferencePrompt(
      [{ name: 'test.csv', columns: ['id', 'value'], sample: [{ id: '1', value: 100 }] }],
      { qualityScore: 80, totalRows: 100, warnings: [], correlations: [], distributions: [], fileId: 'f1' }
    )
    expect(prompt).toContain('test.csv')
    expect(prompt).toContain('id')
    expect(prompt).toContain('value')
  })
})

describe('parseInferenceResult', () => {
  it('should parse valid JSON response', () => {
    const json = JSON.stringify({
      domain: '테스트',
      briefing: '테스트 데이터입니다',
      columnMeanings: { id: '식별자' },
      keyMetrics: ['value'],
      warnings: [],
      suggestedQuestions: ['분포 분석'],
      greeting: '안녕하세요',
    })
    const result = parseInferenceResult(json)
    expect(result.domain).toBe('테스트')
    expect(result.confirmed).toBe(false)
  })

  it('should return fallback on invalid JSON', () => {
    const result = parseInferenceResult('invalid json')
    expect(result.domain).toBe('')
    expect(result.briefing).toContain('데이터')
  })
})
```

**Step 2: 테스트 실패 확인**

Run: `npm test -- --run __tests__/lib/briefing.test.ts`
Expected: FAIL — 모듈 없음

**Step 3: 구현**

```typescript
// lib/briefing.ts
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
```

**Step 4: 테스트 통과 확인**

Run: `npm test -- --run __tests__/lib/briefing.test.ts`
Expected: PASS

**Step 5: 커밋**

```bash
git add lib/briefing.ts __tests__/lib/briefing.test.ts
git commit -m "feat: add context inference with Infer-Then-Confirm"
```

---

## Task 3: Upload API에 Context Inference 연결

**Files:**
- Modify: `app/api/upload/route.ts`

**Step 1: inferContext import 및 호출 추가**

upload/route.ts 수정사항:

1. import 추가: `import { inferContext } from '@/lib/briefing'`
2. import 추가: `import type { DataBriefing } from '@/lib/types'` (이미 types에서 다른것 가져오므로 추가)
3. `let briefing: DataBriefing | undefined` 변수 선언 (`let profile` 옆)
4. Smart Profile 실행 후, `inferContext` 호출:

```typescript
// Context Inference (Haiku — fast + cheap)
const metaSummary = results.map(f => ({
  name: f.name,
  columns: f.columns.map(c => c.name),
  sample: f.sample,
}))
briefing = await inferContext(metaSummary, profile ?? null)
```

5. 응답에 `briefing` 추가:

```typescript
return NextResponse.json({
  data: {
    files: results,
    charts: allCharts,
    profile,
    quickActions,
    briefing,           // ← 추가
  },
})
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 3: 커밋**

```bash
git add app/api/upload/route.ts
git commit -m "feat: call inferContext in upload API"
```

---

## Task 4: Context Confirm API 생성

**Files:**
- Create: `app/api/context/route.ts`

**Step 1: 구현**

사용자가 컨텍스트를 확인하거나 수정했을 때 호출되는 API:

```typescript
// app/api/context/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSessionStore } from '@/lib/sessions'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileId, domain, businessContext, columnMeanings } = body

    if (!fileId) {
      return NextResponse.json({ error: 'fileId required' }, { status: 400 })
    }

    const store = getSessionStore()
    store.saveContext(fileId, {
      fileId,
      columnMeanings: columnMeanings ?? {},
      businessContext: businessContext ?? '',
      knownRelationships: [],
      previousInsights: [],
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ data: { saved: true } })
  } catch (error) {
    console.error('[CONTEXT]', error)
    return NextResponse.json({ error: '컨텍스트 저장 실패' }, { status: 500 })
  }
}
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 3: 커밋**

```bash
git add app/api/context/route.ts
git commit -m "feat: add context confirm API"
```

---

## Task 5: DataBriefingCard 컴포넌트 생성

**Files:**
- Create: `app/components/DataBriefingCard.tsx`

**Step 1: 구현**

기존 ProfileCard를 대체하는 새 컴포넌트. 추론 결과 표시 + [맞아요/수정할게요] UI.

```tsx
"use client"

import { useState } from 'react'
import type { DataBriefing, DataProfile } from '@/lib/types'

interface DataBriefingCardProps {
  briefing: DataBriefing
  profile: DataProfile | null
  onConfirm: (briefing: DataBriefing) => void
  onSuggestedQuestion: (question: string) => void
}

export default function DataBriefingCard({
  briefing,
  profile,
  onConfirm,
  onSuggestedQuestion,
}: DataBriefingCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [userContext, setUserContext] = useState('')

  const scoreColor = !profile ? 'var(--text-tertiary)'
    : profile.qualityScore >= 80 ? 'var(--success)'
    : profile.qualityScore >= 50 ? 'var(--warning)'
    : 'var(--error)'

  const handleConfirm = () => {
    onConfirm({ ...briefing, confirmed: true })
  }

  const handleCorrect = () => {
    if (!userContext.trim()) return
    onConfirm({
      ...briefing,
      domain: userContext.trim(),
      briefing: `${userContext.trim()} 데이터를 분석합니다.`,
      confirmed: true,
    })
    setIsEditing(false)
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      {/* 헤더 */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Data Briefing</h3>
        <div className="flex items-center gap-2">
          {profile && (
            <>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {profile.totalRows.toLocaleString()}행
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-bold"
                style={{ color: scoreColor, border: `1px solid ${scoreColor}` }}
              >
                {profile.qualityScore}점
              </span>
            </>
          )}
        </div>
      </div>

      {/* AI 추론 결과 */}
      {briefing.domain && (
        <p className="mb-1 text-xs font-medium" style={{ color: 'var(--accent-muted)' }}>
          {briefing.domain}
        </p>
      )}
      <p className="mb-3 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {briefing.briefing}
      </p>

      {/* 도메인 관점 경고 */}
      {briefing.warnings.length > 0 && (
        <div className="mb-3 space-y-1">
          {briefing.warnings.map((w, i) => (
            <p key={i} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {w}
            </p>
          ))}
        </div>
      )}

      {/* 확인/수정 UI — 미확인 시에만 표시 */}
      {!briefing.confirmed && (
        <div className="mb-3">
          {!isEditing ? (
            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                className="rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                맞아요
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                수정할게요
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCorrect()}
                placeholder="예: 알트타운 VTuber 가치 거래 플랫폼"
                className="flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
                autoFocus
              />
              <button
                onClick={handleCorrect}
                disabled={!userContext.trim()}
                className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-30"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                확인
              </button>
            </div>
          )}
        </div>
      )}

      {/* 추천 분석 칩 */}
      {briefing.suggestedQuestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {briefing.suggestedQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => onSuggestedQuestion(q)}
              className="rounded-full px-3 py-1 text-xs hover:bg-white/10"
              style={{
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 3: 커밋**

```bash
git add app/components/DataBriefingCard.tsx
git commit -m "feat: add DataBriefingCard with Infer-Then-Confirm UI"
```

---

## Task 6: Dashboard에 DataBriefingCard 연결 + DataTable 탭 제거

**Files:**
- Modify: `app/components/Dashboard.tsx`

**Step 1: 수정**

변경 사항:
1. `ProfileCard`, `DataTable` import 제거
2. `DataBriefingCard` import 추가
3. props에서 `sampleData`, `sampleColumns` 제거 → `briefing`, `onConfirmBriefing`, `onSuggestedQuestion` 추가
4. 탭 UI 제거 (Charts/Data 탭 불필요)
5. ProfileCard 렌더 → DataBriefingCard 렌더로 교체
6. DataTable 렌더 제거
7. 차트 없을 때 빈 상태: 추천 분석 칩으로 행동 유도

props 변경:

```typescript
interface DashboardProps {
  charts: ChartData[]
  pinnedCharts: ChartData[]
  onUnpinChart: (chartId: string) => void
  profile?: DataProfile | null
  briefing?: DataBriefing | null
  onConfirmBriefing: (briefing: DataBriefing) => void
  onSuggestedQuestion: (question: string) => void
  onChartClick?: (event: { suggestedQuestion: string }) => void
}
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 3: 커밋**

```bash
git add app/components/Dashboard.tsx
git commit -m "feat: replace ProfileCard with DataBriefingCard in Dashboard"
```

---

## Task 7: Sidebar에 "원본 보기" 버튼 추가

**Files:**
- Modify: `app/components/Sidebar.tsx`

**Step 1: 수정**

변경 사항:
1. props에 `onToggleDataTable: () => void`, `showDataTable: boolean` 추가
2. 파일 목록 영역에 파일이 있을 때 "원본 보기" 토글 버튼 추가

파일 목록 `<ul>` 아래에:

```tsx
{files.length > 0 && (
  <button
    onClick={onToggleDataTable}
    className="mt-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-white/5"
    style={{ color: showDataTable ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
  >
    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path d="M3 10h18M3 14h18M3 6h18M3 18h18" />
    </svg>
    {showDataTable ? '원본 숨기기' : '원본 보기'}
  </button>
)}
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 3: 커밋**

```bash
git add app/components/Sidebar.tsx
git commit -m "feat: add raw data toggle button in Sidebar"
```

---

## Task 8: page.tsx 전체 연결

**Files:**
- Modify: `app/page.tsx`

**Step 1: 수정**

핵심 변경 사항:

1. `DataBriefing` 타입 import 추가
2. 새 state 추가:
   - `const [briefing, setBriefing] = useState<DataBriefing | null>(null)`
   - `const [showDataTable, setShowDataTable] = useState(false)`

3. `handleFilesUploaded`에 briefing 처리 추가:
   - 함수 시그니처에 `newBriefing?: DataBriefing` 추가
   - `if (newBriefing) setBriefing(newBriefing)` 추가
   - ResearchPanel 자동 열기: `setIsChatOpen(true)`
   - AI 인사말을 chatMessages에 추가:
     ```typescript
     if (newBriefing?.greeting) {
       setChatMessages([{
         role: 'assistant',
         content: newBriefing.greeting,
         suggestedQuestions: newBriefing.suggestedQuestions,
       } as ChatMessage])
     }
     ```

4. `handleConfirmBriefing` 콜백 추가:
   ```typescript
   const handleConfirmBriefing = useCallback(async (confirmed: DataBriefing) => {
     setBriefing(confirmed)
     // 서버에 컨텍스트 저장
     const fileId = selectedFileIds[0]
     if (fileId) {
       await fetch('/api/context', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           fileId,
           domain: confirmed.domain,
           businessContext: confirmed.briefing,
           columnMeanings: confirmed.columnMeanings,
         }),
       })
     }
   }, [selectedFileIds])
   ```

5. `handleSuggestedQuestion` 콜백 추가:
   ```typescript
   const handleSuggestedQuestion = useCallback((question: string) => {
     setIsChatOpen(true)
     handleQuickAction(question)
   }, [handleQuickAction])
   ```

6. `Sidebar` props 업데이트:
   - `onToggleDataTable={() => setShowDataTable(prev => !prev)}`
   - `showDataTable={showDataTable}`
   - `onFilesUploaded` 시그니처가 briefing도 받도록 수정

7. `Sidebar`의 `handleUpload`에서 `payload.briefing`도 전달하도록 수정

8. `Dashboard` props 업데이트:
   - `sampleData`, `sampleColumns` 제거
   - `briefing={briefing}` 추가
   - `onConfirmBriefing={handleConfirmBriefing}` 추가
   - `onSuggestedQuestion={handleSuggestedQuestion}` 추가

9. DataTable을 Dashboard 밖에서 조건부 렌더 (showDataTable일 때만):
   ```tsx
   {showDataTable && sampleData && sampleColumns && (
     <div className="mb-4">
       <DataTable data={sampleData} columns={sampleColumns} />
     </div>
   )}
   ```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 3: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: wire DataBriefing into main app shell"
```

---

## Task 9: Sidebar의 onFilesUploaded 시그니처 업데이트

**Files:**
- Modify: `app/components/Sidebar.tsx`

**Step 1: 수정**

`SidebarProps`의 `onFilesUploaded` 시그니처에 `briefing` 추가:

```typescript
onFilesUploaded: (
  files: FileMetadata[],
  charts: ChartData[],
  profile?: DataProfile,
  quickActions?: QuickAction[],
  briefing?: DataBriefing,           // ← 추가
) => void
```

`handleUpload` 내부에서 `payload.briefing`도 전달:

```typescript
onFilesUploaded(
  payload.files,
  payload.charts || [],
  payload.profile,
  payload.quickActions,
  payload.briefing,                 // ← 추가
)
```

import에 `DataBriefing` 추가.

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 3: 커밋**

```bash
git add app/components/Sidebar.tsx
git commit -m "feat: pass DataBriefing through Sidebar upload flow"
```

---

## Task 10: 최종 검증

**Step 1: 전체 빌드**

Run: `npm run build`
Expected: PASS

**Step 2: 린트**

Run: `npm run lint`
Expected: PASS (경고 0)

**Step 3: 테스트**

Run: `npm test`
Expected: 전체 통과 (기존 84 + 신규 briefing 테스트)

**Step 4: 최종 커밋**

필요 시 누락된 파일 정리 후 커밋.

---

## 파일 변경 요약

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `lib/types.ts` | Modify | DataBriefing 타입, UploadResult에 briefing 필드 |
| `lib/briefing.ts` | Create | inferContext, buildInferencePrompt, parseInferenceResult |
| `__tests__/lib/briefing.test.ts` | Create | briefing 단위 테스트 |
| `app/api/upload/route.ts` | Modify | inferContext 호출 추가 |
| `app/api/context/route.ts` | Create | 컨텍스트 확인/수정 저장 API |
| `app/components/DataBriefingCard.tsx` | Create | Data Briefing UI (추론 표시 + 확인/수정) |
| `app/components/Dashboard.tsx` | Modify | ProfileCard→DataBriefingCard, DataTable 탭 제거 |
| `app/components/Sidebar.tsx` | Modify | 원본 보기 토글 + briefing 전달 |
| `app/page.tsx` | Modify | briefing 상태, 확인 콜백, AI 인사말, DataTable 토글 |
