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
lib/               → Application Layer (비즈니스 로직, 유스케이스 오케스트레이션)
lib/infra/         → Infrastructure Layer (외부 서비스: Claude API, SQLite, 파일시스템)
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

### 완료
- [x] 프로젝트 초기화 (Next.js + TailwindCSS + 의존성)
- [x] Sidebar.tsx - 파일 업로드 UI (드래그앤드롭, 파일 목록)
- [x] Dashboard.tsx - 차트 그리드 레이아웃 (자동분석 + 핀)
- [x] ChartCard.tsx - Recharts 기반 차트 카드 (bar, line, pie, histogram, summary)
- [x] page.tsx - 메인 앱 셸 + 상태 관리
- [x] 다크 테마 CSS 디자인 시스템
- [x] MVP 설계 문서

### 미완료 (의존성 순서)
- [ ] `lib/types.ts` - 공유 타입 정의 (독립)
- [ ] `lib/metadata.ts` - CSV 메타데이터 추출 (독립)
- [ ] `lib/claude.ts` - Claude API 래퍼 (독립)
- [ ] `lib/executor.ts` - Python subprocess 실행 (독립)
- [ ] `lib/sessions.ts` - SQLite 세션 관리 (독립)
- [ ] `scripts/analyze.py` - Python 실행 템플릿 (독립)
- [ ] `app/api/upload/route.ts` - 파일 업로드 API (← metadata, claude, executor 의존)
- [ ] `app/api/chat/route.ts` - AI 채팅 API (← claude, executor, sessions 의존)
- [ ] `app/api/sessions/route.ts` - 세션 목록 API (← sessions 의존)
- [ ] `app/api/sessions/[id]/route.ts` - 세션 상세 API (← sessions 의존)
- [ ] `app/components/ChatPanel.tsx` - 채팅 UI (← chat API 의존)

### 크리티컬 블로커
- ChatPanel.tsx 미존재 → page.tsx에서 import → **빌드 실패**
- 모든 API 라우트 빈 디렉토리 → 프론트엔드 동작 불가

---

## Skill-Based Orchestration (스킬 기반 오케스트레이션)

이 프로젝트는 `.claude/skills/` 하위에 정의된 전문 직군별 스킬을 활용하여 작업한다.
각 스킬은 해당 직군의 시니어급 역량/체크리스트/품질 기준을 포함한다.

| 스킬 | 담당 영역 | 주요 파일 |
|------|-----------|-----------|
| `data-engineer` | 데이터 파이프라인, ETL, 스키마 설계 | lib/metadata.ts, scripts/ |
| `data-scientist` | 분석 알고리즘, 통계 모델, 프롬프트 설계 | lib/claude.ts (프롬프트), scripts/analyze.py |
| `data-analyst` | EDA, 시각화, 인사이트 도출 | 대시보드 차트 로직, 분석 결과 해석 |
| `frontend-dev` | React 컴포넌트, UI/UX, 디자인 시스템 | app/components/, app/page.tsx, globals.css |
| `backend-dev` | API 설계, DB, 서버 로직, 보안 | app/api/, lib/, SQLite |
| `ai-agent-dev` | LLM 통합, 에이전트 루프, 코드 실행 | lib/claude.ts, lib/executor.ts |
| `marketer` | 제품 포지셔닝, 사용자 시나리오, 카피 | UI 텍스트, 온보딩 흐름 |
| `bd` | 비즈니스 모델, 확장 전략, 파트너십 | 제품 로드맵, API 연동 우선순위 |
| `qa-engineer` | 테스트 전략, 품질 보증, 버그 추적 | 테스트 코드, CI/CD, 빌드 검증 |

### 오케스트레이션 규칙
1. 작업 시작 시 해당 직군 스킬을 먼저 로드하여 기준 확인
2. 복합 작업은 관련 스킬을 순차 참조 (예: API 개발 = backend-dev → qa-engineer)
3. 스킬 간 충돌 시 클린 아키텍처 원칙이 우선

---

## File Conventions (파일 규칙)

| 경로 | 용도 |
|------|------|
| `docs/plans/` | 설계 문서, 플랜 |
| `app/components/` | React UI 컴포넌트 |
| `app/api/` | Next.js API 라우트 |
| `lib/` | 비즈니스 로직, 유틸리티 |
| `lib/types.ts` | 공유 TypeScript 타입 |
| `scripts/` | Python 실행 스크립트 |
| `uploads/` | 업로드된 CSV 파일 (gitignore) |
| `outputs/` | 생성된 차트 이미지 (gitignore) |
| `__tests__/` | 테스트 코드 |

---

## Commands (자주 쓰는 명령어)

```bash
npm run dev          # 개발 서버 실행
npm run build        # 프로덕션 빌드 (커밋 전 필수)
npm run lint         # ESLint 검사
npm test             # 테스트 실행
```
