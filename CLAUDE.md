# CLAUDE.md - VibeSemantic: CSV Analysis AI Agent

## Project Overview
- **제품**: CSV 데이터 업로드 → 자동 대시보드 생성 → AI 채팅 인사이트 발굴 웹앱
- **스택**: Next.js 16 (App Router) + TailwindCSS + Recharts + Claude API + Python subprocess + SQLite
- **MVP 스펙**: `docs/plans/2026-02-02-csv-analysis-agent-design.md` 참조
- **한국어로 응답한다**

---

## Architecture Principles (클린 아키텍처)

### 레이어 분리 원칙
```
app/components/    → Presentation Layer (UI 컴포넌트, 상태 표시)
app/api/           → Interface Layer (HTTP 라우트, 요청/응답 변환)
lib/               → Application Layer (비즈니스 로직 + 인프라 통합)
scripts/           → External Systems (Python 실행 환경)
```

### 핵심 규칙
- **의존성 방향**: 외부 → 내부로만 (UI → API → lib → infra). 역방향 의존 금지
- **인터페이스 분리**: 각 레이어는 TypeScript interface로 계약 정의 → 구현은 교체 가능
- **단일 책임**: 하나의 파일은 하나의 명확한 역할만. 200줄 초과 시 분리 검토
- **Side Effect 격리**: 파일 I/O, 네트워크, DB 접근은 infra 레이어에만 존재

### 디자인 시스템
- **CSS Variables 기반 테마**: `globals.css`의 `--bg-*`, `--text-*`, `--accent-*` 변수 사용
- **컴포넌트 컨벤션**: Props interface 필수 정의, 합성(Composition) 패턴 우선
- **Recharts 통일**: 차트 라이브러리는 Recharts로 통일, 직접 D3 사용 금지
- **반응형**: TailwindCSS breakpoint(sm/md/lg/xl) 기반, 모바일 우선 설계

---

## Development Workflow (개발 워크플로우)

### 철칙: Plan → Task Master → Focus → Verify

1. **Plan First**: 코드 작성 전 반드시 설계/플랜 수립. 복잡한 기능은 `docs/plans/`에 문서화
2. **Task Master**: 플랜 확정 후 TaskCreate로 작업 항목 분해. 의존성(blockedBy) 명시 필수
3. **One Task Focus**: 한 번에 하나의 태스크에만 집중. 멀티태스킹 금지
4. **Test First (TDD)**: 구현 전 테스트 코드 작성 → 실패 확인 → 구현 → 통과 확인
5. **Self-Verify**: 완료 선언 전 반드시 테스트 실행 + 빌드 확인. "될 것 같다" 금지

### 의존성 관리 체크리스트
- [ ] 새 패키지 추가 전: 기존 의존성으로 해결 가능한지 먼저 확인
- [ ] package.json 변경 시: `npm install` 실행 확인
- [ ] Python 의존성: `scripts/requirements.txt`에 명시 (pandas, matplotlib, seaborn 기본)
- [ ] 순환 의존성 금지: import 경로가 순환하지 않는지 확인
- [ ] 타입 안전성: `any` 사용 최소화, 공유 타입은 `lib/types.ts`에 정의

### 테스트 전략
- **단위 테스트**: lib/ 내 모든 함수는 테스트 필수 (Jest/Vitest)
- **API 테스트**: 각 API 라우트별 요청/응답 테스트
- **통합 테스트**: 업로드→분석→차트 생성 E2E 플로우
- **자체 검증**: `npm run build` 성공 + `npm run lint` 통과를 커밋 전 필수 확인

---

## Token Optimization (토큰 최적화)

### Claude Code 세션 최적화
- 대용량 파일은 head/sample로 구조만 먼저 파악, 필요한 컬럼만 선택
- 전체 데이터 출력 대신 describe(), shape, dtypes 등 요약 정보 우선
- 중간 결과물은 스크래치패드 디렉토리에 저장, 최종 결과만 응답에 포함
- 반복 분석 시 이전 결과를 재활용, 불필요한 재계산 회피
- 시각화는 파일로 저장 후 경로만 공유

### 제품 내 LLM 토큰 최적화
- **CSV 원본을 LLM에 보내지 않음** — 메타데이터(컬럼명 + 샘플 5행)만 전달
- **대화 이력 요약** — 10턴 이상 시 이전 대화 압축
- **실행 결과 요약** — stdout만 전달, 대용량 출력은 truncate
- **프롬프트 캐싱** — Claude API prompt caching 활용 (반복 비용 90% 절감)
- **비용 목표**: 단순 질문 ~7원, 자동 대시보드 ~13원, 복잡 분석 ~40원/요청

---

## Current MVP Status (현재 진행 상태)

### 구현 완료
- [x] 프로젝트 초기화 (Next.js 16 + TailwindCSS 4 + 의존성)
- [x] Vitest 테스트 인프라 + 테스트 픽스처
- [x] `lib/types.ts` - 공유 타입 정의 (7개 인터페이스)
- [x] `lib/metadata.ts` - CSV 메타데이터 추출 (파싱, 타입 추론)
- [x] `lib/claude.ts` - Claude API 래퍼 (프롬프트 빌더 + API 호출)
- [x] `lib/executor.ts` - Python subprocess 실행 (보안 검증 + 타임아웃)
- [x] `lib/sessions.ts` - SQLite 세션 관리 (better-sqlite3, WAL 모드)
- [x] `app/api/upload/route.ts` - 파일 업로드 + 자동 대시보드 생성
- [x] `app/api/chat/route.ts` - AI 채팅 (코드 생성→실행→해석, 재시도 2회)
- [x] `app/api/sessions/route.ts` - 세션 목록 API
- [x] `app/api/sessions/[id]/route.ts` - 세션 상세 API
- [x] `app/api/outputs/[...path]/route.ts` - 차트 이미지 서빙 (path traversal 방지)
- [x] `app/components/Sidebar.tsx` - 파일 업로드 UI (드래그앤드롭, 파일 목록)
- [x] `app/components/Dashboard.tsx` - 차트 그리드 레이아웃 (자동분석 + 핀)
- [x] `app/components/ChartCard.tsx` - Recharts 기반 차트 카드 (bar, line, pie, histogram, summary)
- [x] `app/components/ChatPanel.tsx` - 채팅 UI (메시지, 코드 접기, 차트 핀)
- [x] `app/page.tsx` - 메인 앱 셸 + 상태 관리
- [x] Supahero 영감 다크 모노크롬 디자인 시스템
- [x] MVP 설계 문서 + 구현 플랜 문서
- [x] 단위 테스트 + 통합 테스트 112개 (13파일)
- [x] P0 세션 영속화 — 새로고침 시 전체 상태 복원
- [x] P1 LLM 스마트 차트 추천 — 규칙 기반 대시보드를 Haiku 추천으로 대체
- [x] P2 채팅 Recharts 전환 — matplotlib PNG → 인터랙티브 차트 + 드릴다운 (2026-02-05)
- [x] P3 대화 이력 압축 — 10턴 초과 시 Haiku 요약 + 캐싱 (2026-02-05)
- [x] 타입 통합 — `UploadedFile` 중복 정의 제거, `lib/types.ts`로 통합 (2026-02-05)
- [x] 통합 테스트 — 세션 생명주기 전체 플로우 테스트 6개 (2026-02-05)
- [x] lint 0 warnings, 빌드 성공
- [x] Python 경로 유연화 — `PYTHON_PATH` 환경 변수 지원

### 알려진 이슈 / 기술 부채
- **P2 E2E 미검증**: Recharts 차트 전환이 실제 LLM 응답에서 안정적으로 동작하는지 실사용 검증 필요 (`docs/plans/2026-02-05-verification-checklist.md` 참조)

### 다음 단계 (우선순위)
- [ ] P2/P3 E2E 검증 (실제 CSV로 Recharts 차트 + 대화 압축 동작 확인)
- [ ] 외부 API 연동 (GA4, Supabase 등 — MVP 이후)

---

## Skill-Based Orchestration (스킬 기반 오케스트레이션)

이 프로젝트는 `.claude/skills/` 하위에 정의된 전문 직군별 스킬을 활용하여 작업한다.
각 스킬은 해당 직군의 시니어급 역량/체크리스트/품질 기준을 포함한다.

### 핵심 스킬 (제품 리더십)

| 스킬 | 담당 영역 | 핵심 역할 |
|------|-----------|-----------|
| `product-owner` | 제품 전략, 우선순위, Wow Moment 결정 | **모든 기능의 GO/NO-GO 결정권자** |
| `product-designer` | UI/UX, 디자인 시스템, 사용자 경험 | **시각적 품질 & 인터랙션 설계** |

### 전문 직군 스킬

| 스킬 | 담당 영역 | 주요 파일 |
|------|-----------|-----------|
| `data-engineer` | 데이터 파이프라인, ETL, 스키마 설계 | lib/metadata.ts, scripts/ |
| `data-scientist` | 분석 알고리즘, 통계 모델, 프롬프트 설계 | lib/claude.ts (프롬프트) |
| `data-analyst` | EDA, 시각화, 인사이트 도출 | 대시보드 차트 로직, 분석 결과 해석 |
| `frontend-dev` | React 컴포넌트, 상태 관리 | app/components/, app/page.tsx |
| `backend-dev` | API 설계, DB, 서버 로직, 보안 | app/api/, lib/, SQLite |
| `ai-agent-dev` | LLM 통합, 에이전트 루프, 코드 실행 | lib/claude.ts, lib/executor.ts |
| `marketer` | 제품 포지셔닝, 사용자 시나리오, 카피 | UI 텍스트, 온보딩 흐름 |
| `bd` | 비즈니스 모델, 확장 전략, 파트너십 | 제품 로드맵, API 연동 우선순위 |
| `qa-engineer` | 테스트 전략, 품질 보증, 버그 추적 | 테스트 코드, CI/CD, 빌드 검증 |

### 오케스트레이션 규칙
1. 작업 시작 시 해당 직군 스킬을 먼저 로드하여 기준 확인
2. 복합 작업은 관련 스킬을 순차 참조 (예: API 개발 = backend-dev → qa-engineer)
3. 스킬 간 충돌 시 클린 아키텍처 원칙이 우선
4. **UI/UX 관련 작업은 반드시 `product-designer` 스킬 참조**
5. **새 기능 기획/우선순위 결정은 `product-owner` 스킬 기준 적용**

---

## Innovation Workflow (혁신 개발 사이클)

모든 요구사항과 아이디어는 아래 사이클을 따른다. **문제 최우선, Wow Moment 추구**가 핵심 원칙이다.

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. 결핍 고민                                                    │
│    └─ 사용자가 뭘 불편해하는가? 뭐가 없어서 답답한가?              │
│                                                                 │
│ 2. 문제 발굴 & 정의                                             │
│    └─ Why 5번 질문, 근본 원인 파악, 문제 구체화                   │
│                                                                 │
│ 3. 솔루션 아이디에이션                                           │
│    └─ 어떻게 해결할 수 있는가? 최소 3개 옵션                      │
│                                                                 │
│ 4. Wow & Impact 판단 ★ PO 핵심 역할                             │
│    └─ Wow Moment 있는가? 임팩트 충분한가? GO/NO-GO               │
│                                                                 │
│ 5. 전문 직군 논의                                               │
│    └─ Designer, Dev, Scientist, QA 각 관점 피드백               │
│                                                                 │
│ 6. 혁신적 방법 강구                                             │
│    └─ 기존 패턴 + 우리만의 차별화된 접근 융합!                    │
│                                                                 │
│ 7. 구현 & 테스트                                                │
│    └─ 빌드, 내부/고객 테스트, Wow Moment & Impact 검증           │
│                                                                 │
│ 8. 개선안 도출                                                  │
│    └─ 피드백 기반 개선, 추가 Wow 기회 발굴                       │
│                                                                 │
│ 9. 회고                                                         │
│    └─ 무엇이 잘 됐는가? 무엇을 배웠는가?                         │
│                                                                 │
│ 10. 다시 플랜!                                                  │
│     └─ 다음 사이클 시작, 새로운 결핍 고민                        │
└─────────────────────────────────────────────────────────────────┘
```

### Wow Moment 기준
- 사용자가 "이게 되네?!" 하고 감탄하는 순간
- 경쟁 제품에서 볼 수 없는 차별화된 경험
- 입소문이 날 만한 "한 장면"

### 핵심 질문
- [ ] 이 문제의 근본 원인을 파악했는가?
- [ ] 기존에 없던 접근 방식을 시도했는가?
- [ ] 사용자가 "와!" 할 순간이 있는가?
- [ ] 우리 제품다운 차별점이 있는가?
- [ ] 단순하고 직관적인가? (설명이 필요하면 실패)

---

## File Conventions (파일 규칙)

| 경로 | 용도 |
|------|------|
| `docs/plans/` | 설계 문서, 플랜 |
| `app/components/` | React UI 컴포넌트 (Sidebar, Dashboard, ChartCard, ChatPanel) |
| `app/api/` | Next.js API 라우트 (upload, chat, sessions, outputs) |
| `lib/` | 비즈니스 로직 (types, metadata, claude, executor, sessions) |
| `scripts/` | Python 의존성 (requirements.txt) |
| `uploads/` | 업로드된 CSV 파일 (gitignore) |
| `outputs/` | 생성된 차트 이미지 (gitignore) |
| `data/` | SQLite DB 파일 (gitignore) |
| `__tests__/` | 테스트 코드 + fixtures |
| `.claude/skills/` | 스킬 기반 오케스트레이션 정의 (11개 직군) |

---

## Commands (자주 쓰는 명령어)

```bash
npm run dev          # 개발 서버 실행
npm run build        # 프로덕션 빌드 (커밋 전 필수)
npm run lint         # ESLint 검사
npm test             # Vitest 단위 테스트 실행
npm run test:watch   # Vitest watch 모드
npm run test:coverage # 커버리지 리포트
```

### Python 환경 셋업
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
```
