# VibeSemantic

CSV 데이터를 업로드하면 자동으로 대시보드를 생성하고, AI 채팅으로 인사이트를 발굴하는 웹앱.

## 스택

- **Frontend**: Next.js 16 (App Router) + TailwindCSS 4 + Recharts 3
- **Backend**: Next.js API Routes + SQLite (better-sqlite3, WAL 모드)
- **AI**: Claude API (Anthropic SDK) — 코드 생성 + 해석
- **분석 실행**: Python subprocess (pandas, matplotlib, seaborn)
- **테스트**: Vitest

## 셋업

### 1. 클론 및 의존성 설치

```bash
git clone https://github.com/unknownstarter/vibesemantic-beta.git
cd vibesemantic-beta
npm install
```

### 2. 환경 변수

`.env.local` 파일을 프로젝트 루트에 생성:

```
ANTHROPIC_API_KEY=sk-ant-api03-여기에-키-입력
```

### 3. Python 가상환경

Python 분석 코드 실행을 위해 `.venv`가 필요합니다. `lib/executor.ts`가 `.venv/bin/python3` 경로를 직접 참조합니다.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
```

### 4. 디렉토리 생성

업로드/출력/DB 디렉토리가 없으면 자동 생성되지만, 미리 만들어두면 안전합니다:

```bash
mkdir -p uploads outputs outputs/cache data
```

### 5. 실행

```bash
npm run dev          # 개발 서버 (http://localhost:3000)
npm run build        # 프로덕션 빌드
npm test             # 단위 테스트
npm run lint         # ESLint
```

## 프로젝트 구조

```
vibesemantic-beta/
├── app/
│   ├── page.tsx                    # 메인 앱 셸 + 전역 상태 관리
│   ├── globals.css                 # CSS 변수 기반 다크 테마
│   ├── hooks/
│   │   └── useAgentStream.ts       # SSE 스트리밍 클라이언트 훅
│   ├── components/
│   │   ├── Sidebar.tsx             # 파일 업로드 + Quick Actions
│   │   ├── Dashboard.tsx           # 차트 그리드 + ProfileCard + DataTable
│   │   ├── ResearchPanel.tsx       # 채팅 + PlanView + SuggestionChips
│   │   ├── ChartCard.tsx           # Recharts 차트 (bar, line, pie, histogram, summary)
│   │   ├── ProfileCard.tsx         # Smart Profile (품질 점수, 경고, 상관관계)
│   │   ├── QuickActions.tsx        # 원클릭 분석 버튼
│   │   ├── DataTable.tsx           # 원본 데이터 테이블
│   │   ├── PlanView.tsx            # 분석 계획 시각화 (단계별 진행)
│   │   ├── SuggestionChips.tsx     # 후속 질문 칩
│   │   ├── ExportButton.tsx        # .py/.ipynb 내보내기
│   │   └── ChatPanel.tsx           # (레거시, ResearchPanel로 대체)
│   └── api/
│       ├── upload/route.ts         # CSV 업로드 → 프로파일 + 자동 대시보드
│       ├── analyze/route.ts        # Plan-First Agent Loop (SSE 스트리밍)
│       ├── chat/route.ts           # 단일 턴 채팅 (하위호환)
│       ├── export/route.ts         # Notebook/Script Export
│       ├── sessions/route.ts       # 세션 목록
│       ├── sessions/[id]/route.ts  # 세션 상세
│       └── outputs/[...path]/route.ts  # 차트 이미지 서빙
├── lib/
│   ├── types.ts                    # 공유 타입 (30+ 인터페이스)
│   ├── agent.ts                    # Plan-First Agent Loop 오케스트레이터
│   ├── claude.ts                   # Claude API 래퍼 (callClaude, generateCode, interpretResult)
│   ├── executor.ts                 # Python subprocess 실행 (보안 검증 + 타임아웃)
│   ├── sessions.ts                 # SQLite 세션/캐시/컨텍스트 관리
│   ├── metadata.ts                 # CSV 메타데이터 추출 (파싱, 타입 추론)
│   ├── dashboard.ts                # 자동 대시보드 + Quick Actions 생성
│   ├── profile.ts                  # Smart Profile (Python 프로파일링)
│   ├── context.ts                  # Stateful Analysis Cache + Context Memory
│   ├── prompts.ts                  # 역할별 프롬프트 (PLANNER, STEP_CODER, SYNTHESIZER)
│   └── export.ts                   # .py/.ipynb 내보내기
├── scripts/
│   └── requirements.txt            # Python 의존성 (pandas, matplotlib, seaborn, numpy)
├── __tests__/lib/                  # 단위 테스트 (Vitest)
├── docs/plans/                     # 설계 문서
├── uploads/                        # 업로드된 CSV (gitignore)
├── outputs/                        # 생성된 차트 이미지 (gitignore)
│   └── cache/                      # 분석 중간 결과 (.parquet)
├── data/                           # SQLite DB (gitignore)
└── CLAUDE.md                       # Claude Code 작업 지침
```

## 아키텍처

### 데이터 흐름

```
CSV 업로드
  → metadata 추출 (lib/metadata.ts)
  → Smart Profile 실행 (lib/profile.ts → Python)
  → Quick Actions 생성 (lib/dashboard.ts)
  → 자동 대시보드 차트 생성 (lib/claude.ts → Python)

질문 입력 (또는 Quick Action 클릭)
  → Plan-First Agent Loop (lib/agent.ts)
     1. planAnalysis()  → Haiku로 2-4단계 계획 생성
     2. executePlan()   → 단계별 코드 생성(Sonnet) → Python 실행 → 캐시
     3. synthesize()    → 전체 결과 종합 + 후속 질문 3개
     4. learnContext()  → 비즈니스 컨텍스트 학습 → SQLite 저장
  → SSE 스트리밍으로 프론트엔드에 실시간 전달
```

### 레이어 분리

| 레이어 | 경로 | 역할 |
|--------|------|------|
| Presentation | `app/components/` | UI, 사용자 인터랙션 |
| Interface | `app/api/` | HTTP 라우트, 요청/응답 변환 |
| Application | `lib/` | 비즈니스 로직, AI 통합, DB |
| External | `scripts/`, `.venv/` | Python 실행 환경 |

### 주요 패턴

- **SSE 스트리밍**: `/api/analyze` → `ReadableStream` → `useAgentStream` 훅이 이벤트 파싱
- **Chart → Chat Bridge**: 차트 클릭 → 자동 질문 생성 → 채팅 입력
- **분석 결과 영속화**: `useAgentStream`의 `onComplete` 콜백 → `chatMessages`에 assistant 메시지 추가
- **Stateful Context**: 분석 중간 결과를 `.parquet`로 캐시, 다음 질문에서 재활용

## 핵심 파일 설명

### `app/hooks/useAgentStream.ts`

SSE 스트리밍 클라이언트 훅. `/api/analyze`에서 오는 이벤트를 파싱하여 상태 업데이트.

- `startAnalysis(question, fileIds, sessionId, history, onComplete)` 호출
- SSE 이벤트별: `plan` → `step_start` → `step_complete` → `synthesis` → `follow_ups` → `complete`
- `complete` 이벤트 시 `onComplete` 콜백으로 결과 전달 → `page.tsx`에서 `chatMessages`에 영속화
- 로컬 변수(`localInsight`, `localCharts`, `localFollowUps`)로 누적하여 state 초기화 후에도 결과 보존

### `lib/agent.ts`

Plan-First Agent Loop. 질문을 받아 다단계 분석 계획 수립 → 실행 → 종합.

- `runAgentLoop()`: Haiku로 계획 → Sonnet으로 코드 생성/실행 → Sonnet으로 종합
- 각 단계 결과를 `outputs/cache/`에 parquet로 캐시
- 실패 시 에러 기반 코드 수정 후 재시도 (최대 2회)

### `lib/prompts.ts`

3가지 역할별 프롬프트:
- **PLANNER**: 질문 → 2-4단계 분석 계획 (JSON)
- **STEP_CODER**: 단계별 Python 코드 생성 (캐시 활용, 중간 결과 parquet 저장)
- **SYNTHESIZER**: 결과 종합 + 데이터 근거 인용 + 후속 질문 3개

## 알려진 이슈

- `app/api/upload/route.ts`의 `fileRegistry`가 in-memory Map → 서버 재시작 시 소실
- `app/page.tsx`에 `UploadedFile` 로컬 인터페이스가 `lib/types.ts`와 별도 존재 (통합 필요)
- `lib/executor.ts`가 `.venv/bin/python3` 하드코딩 → `.venv` 없으면 Python 실행 실패
- 대화 이력 압축 (10턴 이상) 미구현
- API 라우트 통합 테스트 미작성

## 다음 단계

1. `fileRegistry`를 SQLite로 영속화
2. `page.tsx` 타입을 `lib/types.ts`로 통합
3. 대화 이력 압축 로직 구현
4. API 통합 테스트 작성
5. 배포 설정 (Vercel 등)
