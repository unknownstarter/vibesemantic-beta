# VibeSemantic MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** CSV 분석 AI 에이전트 풀 MVP — 업로드, 자동 대시보드, AI 채팅, 핀, 세션 관리를 블랙&화이트 미니멀 디자인으로 구현

**Architecture:** Bottom-Up. lib/ 기반 유틸리티 → API 라우트 → UI 순서. 각 레이어를 Vitest로 테스트하며 쌓는다. 디자인 시스템은 Supahero.io 영감의 다크 모노크롬(순수 블랙/화이트/그레이, 단일 액센트)으로 리팩토링.

**Tech Stack:** Next.js 16 (App Router), React 19, TailwindCSS 4, Recharts, Claude API (Sonnet), Python subprocess, better-sqlite3, Vitest

**Design Reference:** Supahero.io 블랙&화이트 톤 — 순수 블랙 배경, 화이트 텍스트, 그레이 보조, 넉넉한 여백, Inter 폰트, 미니멀 보더, 8-12px 라운드

---

## Phase 1: Foundation

### Task 1: Vitest 테스트 인프라 셋업

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts 추가)

**Step 1: Vitest + 테스트 의존성 설치**

```bash
npm install -D vitest @vitejs/plugin-react
```

**Step 2: vitest.config.ts 생성**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    exclude: ['node_modules'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

**Step 3: package.json에 test 스크립트 추가**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

**Step 4: 스모크 테스트 생성 및 실행**

Create `__tests__/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'

describe('Test infrastructure', () => {
  it('should run tests', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add vitest.config.ts __tests__/smoke.test.ts package.json package-lock.json
git commit -m "chore: set up Vitest test infrastructure"
```

---

### Task 2: 공유 타입 정의 (lib/types.ts)

**Files:**
- Create: `lib/types.ts`

**Step 1: 타입 정의**

```typescript
// CSV 파일 메타데이터
export interface FileMetadata {
  id: string
  name: string
  path: string
  columns: ColumnInfo[]
  rowCount: number
  sample: Record<string, unknown>[]
  createdAt: string
}

export interface ColumnInfo {
  name: string
  type: 'number' | 'string' | 'date' | 'boolean'
  nullCount: number
  uniqueCount: number
}

// 차트 데이터
export type ChartType = 'bar' | 'line' | 'pie' | 'histogram' | 'summary'

export interface ChartData {
  id: string
  type: ChartType
  title: string
  data: Record<string, unknown>[]
  xKey?: string
  yKey?: string
  imageUrl?: string
}

// 채팅
export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  charts?: ChartData[]
  code?: string
  createdAt: string
}

// 세션
export interface Session {
  id: string
  title: string
  fileIds: string[]
  createdAt: string
  updatedAt: string
}

// API 응답
export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
}

// 업로드 응답
export interface UploadResult {
  files: FileMetadata[]
  charts: ChartData[]
}

// 채팅 응답
export interface ChatResponse {
  reply: string
  code?: string
  charts?: ChartData[]
  pinnable: boolean
}

// Python 실행 결과
export interface ExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  generatedFiles: string[]
}
```

**Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add shared TypeScript type definitions"
```

---

### Task 3: CSV 메타데이터 추출 (lib/metadata.ts)

**Files:**
- Create: `lib/metadata.ts`
- Create: `__tests__/lib/metadata.test.ts`
- Create: `__tests__/fixtures/sample.csv`
- Create: `__tests__/fixtures/korean.csv`
- Create: `__tests__/fixtures/empty.csv`

**Step 1: 테스트 픽스처 생성**

`__tests__/fixtures/sample.csv`:
```csv
name,age,score,date
Alice,30,95.5,2024-01-01
Bob,25,87.3,2024-01-02
Charlie,35,92.1,2024-01-03
Diana,28,88.9,2024-01-04
Eve,32,91.0,2024-01-05
```

`__tests__/fixtures/korean.csv`:
```csv
이름,나이,점수
홍길동,30,95
김철수,25,87
이영희,35,92
```

`__tests__/fixtures/empty.csv`:
```csv
name,age,score
```

**Step 2: 실패하는 테스트 작성**

`__tests__/lib/metadata.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { extractMetadata } from '@/lib/metadata'
import path from 'path'

const FIXTURES = path.join(__dirname, '..', 'fixtures')

describe('extractMetadata', () => {
  it('should extract columns, rowCount, and sample from CSV', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'sample.csv'))
    expect(result.columns).toHaveLength(4)
    expect(result.columns[0].name).toBe('name')
    expect(result.columns[1].name).toBe('age')
    expect(result.columns[1].type).toBe('number')
    expect(result.columns[3].type).toBe('date')
    expect(result.rowCount).toBe(5)
    expect(result.sample).toHaveLength(5)
  })

  it('should handle Korean CSV', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'korean.csv'))
    expect(result.columns[0].name).toBe('이름')
    expect(result.rowCount).toBe(3)
  })

  it('should handle CSV with headers only', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'empty.csv'))
    expect(result.columns).toHaveLength(3)
    expect(result.rowCount).toBe(0)
    expect(result.sample).toHaveLength(0)
  })
})
```

Run: `npm test` — Expected: FAIL

**Step 3: 구현**

`lib/metadata.ts`:
```typescript
import fs from 'fs/promises'
import type { ColumnInfo } from './types'

interface MetadataResult {
  columns: ColumnInfo[]
  rowCount: number
  sample: Record<string, unknown>[]
}

export async function extractMetadata(filePath: string): Promise<MetadataResult> {
  const content = await fs.readFile(filePath, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim() !== '')

  if (lines.length === 0) {
    return { columns: [], rowCount: 0, sample: [] }
  }

  const headers = parseCSVLine(lines[0])
  const dataLines = lines.slice(1)
  const rows: Record<string, unknown>[] = []

  for (const line of dataLines) {
    const values = parseCSVLine(line)
    const row: Record<string, unknown> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? null })
    rows.push(row)
  }

  const sample = rows.slice(0, 5)
  const columns: ColumnInfo[] = headers.map(name => {
    const values = rows.map(r => r[name])
    return {
      name,
      type: inferType(values),
      nullCount: values.filter(v => v === null || v === '' || v === undefined).length,
      uniqueCount: new Set(values.filter(v => v !== null && v !== '')).size,
    }
  })

  return { columns, rowCount: rows.length, sample }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function inferType(values: unknown[]): ColumnInfo['type'] {
  const nonEmpty = values.filter(v => v !== null && v !== '' && v !== undefined)
  if (nonEmpty.length === 0) return 'string'

  const sample = nonEmpty.slice(0, 20)

  if (sample.every(v => !isNaN(Number(v)))) return 'number'

  const datePattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/
  if (sample.every(v => datePattern.test(String(v)))) return 'date'

  return 'string'
}
```

Run: `npm test` — Expected: PASS

**Step 4: Commit**

```bash
git add lib/metadata.ts __tests__/lib/metadata.test.ts __tests__/fixtures/
git commit -m "feat: add CSV metadata extraction with type inference"
```

---

### Task 4: Claude API 래퍼 (lib/claude.ts)

**Files:**
- Create: `lib/claude.ts`
- Create: `__tests__/lib/claude.test.ts`

**Step 1: 실패하는 테스트 작성**

`__tests__/lib/claude.test.ts`:
```typescript
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
```

Run: `npm test` — Expected: FAIL

**Step 2: 구현**

`lib/claude.ts` — Claude API 래퍼. 순수 함수(buildCodeGenMessages, buildInterpretMessages, extractPythonCode)와 API 호출 함수(generateCode, interpretResult)를 분리.

- 시스템 프롬프트: 코드 생성용, 결과 해석용 2종
- 메타데이터 컨텍스트를 시스템 프롬프트에 동적 주입
- spawn 방식의 Python 실행 (child_process.spawn 사용, shell injection 방지)
- 프롬프트 캐싱을 위해 시스템 프롬프트 정적 부분 최대화

Run: `npm test` — Expected: PASS (순수 함수만 테스트)

**Step 3: Commit**

```bash
git add lib/claude.ts __tests__/lib/claude.test.ts
git commit -m "feat: add Claude API wrapper with prompt builders"
```

---

### Task 5: Python 실행기 (lib/executor.ts)

**Files:**
- Create: `lib/executor.ts`
- Create: `__tests__/lib/executor.test.ts`

**Step 1: 실패하는 테스트 작성**

`__tests__/lib/executor.test.ts` — validateCode (보안 검증) + executePython (실행) 테스트

- validateCode: 안전한 pandas 코드 허용, 위험 모듈(subprocess, socket, requests) 차단
- executePython: print 실행, stderr 캡처, 타임아웃 테스트

Run: `npm test` — Expected: FAIL

**Step 2: 구현**

`lib/executor.ts` — child_process.spawn으로 Python3 실행.
- 블랙리스트 기반 보안 검증 (위험 import/함수 차단)
- 타임아웃 설정 (기본 30초)
- stdout/stderr 캡처
- outputs/ 디렉토리 내 새 파일 감지

Run: `npm test` — Expected: PASS

**Step 3: Commit**

```bash
git add lib/executor.ts __tests__/lib/executor.test.ts
git commit -m "feat: add Python subprocess executor with security validation"
```

---

### Task 6: SQLite 세션 관리 (lib/sessions.ts)

**Files:**
- Create: `lib/sessions.ts`
- Create: `__tests__/lib/sessions.test.ts`

**Step 1: 실패하는 테스트 작성**

`__tests__/lib/sessions.test.ts` — SessionStore 클래스 테스트 (in-memory SQLite)
- createSession + getSession
- listSessions
- addMessage + getMessages
- charts/code 저장 및 조회

Run: `npm test` — Expected: FAIL

**Step 2: 구현**

`lib/sessions.ts` — better-sqlite3 기반 세션 스토어.
- WAL 모드, 자동 마이그레이션
- sessions 테이블 + messages 테이블
- Prepared Statements (SQL Injection 방지)
- 싱글톤 패턴 (getSessionStore)

Run: `npm test` — Expected: PASS

**Step 3: Commit**

```bash
git add lib/sessions.ts __tests__/lib/sessions.test.ts
git commit -m "feat: add SQLite session store with messages"
```

---

### Task 7: Python 의존성 파일

**Files:**
- Create: `scripts/requirements.txt`

```
pandas>=2.0
matplotlib>=3.7
seaborn>=0.12
numpy>=1.24
```

**Commit:**

```bash
git add scripts/requirements.txt
git commit -m "feat: add Python analysis dependencies"
```

---

## Phase 2: API Routes

### Task 8: 파일 업로드 API (POST /api/upload)

**Files:**
- Create: `app/api/upload/route.ts`

CSV 업로드 → 파일 저장 → 메타데이터 추출 → Claude 자동 분석 → 대시보드 차트 반환.
파일 검증(.csv만), UUID 저장, 에러 시 fallback summary.

**Commit:**
```bash
git add app/api/upload/route.ts
git commit -m "feat: add file upload API with auto-analysis"
```

---

### Task 9: AI 채팅 API (POST /api/chat)

**Files:**
- Create: `app/api/chat/route.ts`

질문 수신 → 메타데이터 컨텍스트 구성 → Claude 코드 생성 → 보안 검증 → Python 실행 → 에러 시 재시도(2회) → 결과 해석 → 차트/코드/응답 반환.

**Commit:**
```bash
git add app/api/chat/route.ts
git commit -m "feat: add AI chat API with code gen/execution/interpret loop"
```

---

### Task 10: 세션 API

**Files:**
- Create: `app/api/sessions/route.ts`
- Create: `app/api/sessions/[id]/route.ts`

세션 목록(GET /api/sessions) + 세션 상세(GET /api/sessions/:id).

**Commit:**
```bash
git add app/api/sessions/
git commit -m "feat: add session list and detail APIs"
```

---

## Phase 3: UI + Design System

### Task 11: 디자인 시스템 리팩토링 (Supahero 블랙&화이트)

**Files:**
- Modify: `app/globals.css`

CSS 변수를 순수 모노크롬으로 교체:
- bg: #050505 ~ #1a1a1a (순수 블랙 계열, 블루틴트 제거)
- text: #f5f5f5 / #828282 / #555555
- accent: #ffffff (단일)
- border: #1e1e1e (미세)
- radius: 10px
- 스크롤바 4px, selection 15% 화이트

**Commit:**
```bash
git add app/globals.css
git commit -m "design: overhaul to Supahero-inspired monochrome dark theme"
```

---

### Task 12: ChatPanel 컴포넌트 구현

**Files:**
- Create: `app/components/ChatPanel.tsx`

채팅 UI: 메시지 목록, 입력, 로딩 애니메이션, 코드 접기, 차트 표시, 핀 버튼.
Enter 전송, Shift+Enter 줄바꿈, Esc 닫기.

**Commit:**
```bash
git add app/components/ChatPanel.tsx
git commit -m "feat: add ChatPanel component with chat UI"
```

---

### Task 13: 기존 컴포넌트 모노크롬 리팩토링

**Files:**
- Modify: `app/components/ChartCard.tsx` — COLORS를 모노크롬으로, 이모지 제거
- Modify: `app/components/Dashboard.tsx` — 이모지 제거, accent-purple → accent
- Modify: `app/components/Sidebar.tsx` — accent-blue → accent
- Modify: `app/page.tsx` — 타입 일관성 확인

**Commit:**
```bash
git add app/components/ app/page.tsx
git commit -m "design: refactor all components to monochrome design system"
```

---

### Task 14: 정적 파일 서빙 + outputs API

**Files:**
- Modify: `next.config.ts` — rewrites 추가
- Create: `app/api/outputs/[...path]/route.ts` — 이미지 서빙 (path traversal 방지)

**Commit:**
```bash
git add next.config.ts app/api/outputs/
git commit -m "feat: add static file serving for chart images"
```

---

### Task 15: 통합 검증

**Step 1:** `npm run build` — 빌드 성공 확인
**Step 2:** `npm run lint` — 린트 통과
**Step 3:** `npm test` — 모든 테스트 통과
**Step 4:** `npm run dev` — 수동 확인 (빈 대시보드, 채팅 패널)

**Commit:**
```bash
git add -A
git commit -m "feat: complete VibeSemantic MVP"
```

---

## Phase Summary

| Phase | Tasks | 핵심 산출물 |
|-------|-------|------------|
| 1: Foundation | 1-7 | Vitest, types, metadata, claude, executor, sessions |
| 2: API Routes | 8-10 | upload, chat, sessions API |
| 3: UI + Design | 11-14 | 모노크롬 디자인, ChatPanel, 컴포넌트 리팩토링, 이미지 서빙 |
| 4: Verify | 15 | 빌드, 린트, 테스트, 수동 확인 |

**총 15개 태스크, 의존성 순서대로 Bottom-Up 실행.**
