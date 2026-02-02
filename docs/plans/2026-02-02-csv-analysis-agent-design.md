# CSV 분석 AI 에이전트 - MVP 설계 문서

> 작성일: 2026-02-02

## 1. 제품 개요

CSV 데이터를 업로드하면 자동 대시보드를 생성하고, AI 채팅으로 인사이트를 발굴할 수 있는 웹 애플리케이션.

**핵심 가치**: 코드 없이, 질문만으로 데이터 분석. 고객과 에이전트가 공유된 데이터에서 함께 인사이트를 발굴하는 경험.

## 2. MVP 범위

### 포함
- CSV 다중 파일 업로드 (드래그앤드롭)
- 업로드 시 자동 분석 대시보드 생성
- AI 채팅으로 자유 질문 → 코드 생성 → 실행 → 결과 반환
- 채팅 결과 차트를 대시보드에 핀(pin)
- 대화 기록 저장/불러오기

### 제외 (다음 단계)
- 외부 API 연동 (GA4, Meta Ads, Google Ads, AdSense, Amplitude, Supabase)
- 사용자 인증 / 멀티테넌트
- 클라우드 배포 / 샌드박스 격리

## 3. 유저 플로우

```
[데이터 추가]          [자동 대시보드]              [AI 채팅]
사이드바               메인 영역                   오른쪽 패널
┌──────────┐     ┌─────────────────────┐    ┌──────────────────┐
│ 📁 파일목록  │     │  자동 생성 차트/지표    │    │ 💬 질문 입력        │
│            │     │  - 총 행/열 수          │    │                    │
│ + CSV 추가  │     │  - 수치형 분포          │    │ 에이전트 응답        │
│  드래그앤드롭│     │  - 범주형 빈도          │    │ (텍스트 + 차트)      │
│            │     │  - 이상치 하이라이트     │    │                    │
│ 📁 AI_버셀리│     │                       │    │ [대시보드에 핀] 버튼  │
│ 📁 UPI     │     │  핀된 차트들            │    │                    │
│ 📁 Virceli │     │                       │    │ 대화 기록 목록       │
└──────────┘     └─────────────────────┘    └──────────────────┘
```

### 상세 플로우

1. **데이터 업로드**: 사이드바에 CSV 드래그앤드롭 → 서버에 파일 저장 + 메타데이터 추출
2. **자동 대시보드**: 업로드 즉시 Claude API가 분석 코드 생성 → 실행 → 대시보드 차트 렌더링
3. **AI 채팅**: 대시보드 옆에서 자연어 질문 → Claude가 코드 생성 → 실행 → 결과 반환
4. **핀 기능**: 채팅 결과 중 차트를 대시보드에 고정
5. **세션 관리**: 대화 기록을 로컬에 저장, 이전 세션 불러오기 가능

## 4. 아키텍처

### 기술 스택

| 레이어 | 기술 | 이유 |
|--------|------|------|
| 프론트엔드 | Next.js + TailwindCSS | 빠른 개발, SSR 지원 |
| 차트 | Recharts | React 네이티브, 반응형 |
| 백엔드 | Next.js API Routes | 프론트와 통합, 배포 간편 |
| LLM | Claude API (Sonnet) | 코드 생성 능력 우수, 비용 효율적 |
| 코드 실행 | 로컬 Python subprocess | MVP 단계에서 가장 간단 |
| 데이터 저장 | 로컬 파일시스템 + SQLite | MVP에 충분, 나중에 Supabase로 전환 |

### 시스템 구조

```
┌─ 브라우저 ──────────────────────────────┐
│  Next.js App                            │
│  ├── 사이드바: 파일 목록 + 업로드        │
│  ├── 메인: 대시보드 (Recharts)           │
│  └── 패널: 채팅 UI                      │
└──────────────┬──────────────────────────┘
               │ HTTP
┌──────────────▼──────────────────────────┐
│  Next.js API Routes                     │
│                                         │
│  POST /api/upload                       │
│    → 파일 저장 (uploads/)               │
│    → 메타데이터 추출 (컬럼명, 샘플 5행)   │
│    → Claude API: 자동 분석 코드 생성      │
│    → Python subprocess 실행             │
│    → 대시보드 데이터 반환                 │
│                                         │
│  POST /api/chat                         │
│    → 대화 이력 + 테이블 메타데이터 구성    │
│    → Claude API: 분석 코드 생성          │
│    → Python subprocess 실행             │
│    → 결과 해석 후 반환                   │
│                                         │
│  GET /api/sessions                      │
│    → 저장된 대화 세션 목록               │
│                                         │
│  GET /api/sessions/:id                  │
│    → 특정 세션 대화 기록                 │
└─────────────────────────────────────────┘
```

## 5. 토큰 비용 설계

### LLM에 전달하는 정보 (CSV 원본 X)

```
시스템 프롬프트:       ~500 토큰  (역할, 규칙, 출력 형식)
테이블 메타데이터:     ~300 토큰/파일  (컬럼명 + 샘플 5행)
대화 이력:            ~200 토큰/턴  (요약 유지)
사용자 질문:           ~100 토큰
LLM 응답 (코드):      ~1,500 토큰
```

### 비용 추정 (Claude Sonnet 기준)

| 시나리오 | 토큰/요청 | 비용/요청 | 비용(원) |
|---------|----------|----------|---------|
| 단순 질문 | ~3,000 | ~$0.005 | ~7원 |
| 자동 대시보드 생성 | ~5,000 | ~$0.01 | ~13원 |
| 복잡한 멀티턴 분석 | ~10,000 | ~$0.03 | ~40원 |

### 토큰 절약 전략

1. **CSV 원본을 LLM에 보내지 않음** — 메타데이터(컬럼명 + 샘플 5행)만 전달
2. **대화 이력 요약** — 10턴 이상이면 이전 대화를 요약해서 압축
3. **코드 실행 결과도 요약** — 10만 행 결과를 그대로 보내지 않고, 실행 결과의 stdout만 전달
4. **시스템 프롬프트 캐싱** — Claude API의 prompt caching 활용 (반복 비용 90% 절감)

## 6. 핵심 API 설계

### POST /api/upload

```
Request:  multipart/form-data { files: File[] }
Response: {
  files: [{
    id: string,
    name: string,
    columns: string[],
    rowCount: number,
    sample: object[],       // 첫 5행
    dashboard: {
      charts: [{
        type: "histogram" | "bar" | "summary",
        title: string,
        data: object,
        imageUrl?: string    // matplotlib 차트 이미지
      }]
    }
  }]
}
```

### POST /api/chat

```
Request: {
  sessionId: string,
  message: string,
  fileIds: string[]          // 분석 대상 파일
}
Response: {
  reply: string,             // 자연어 응답
  code?: string,             // 실행한 Python 코드
  charts?: [{
    title: string,
    imageUrl: string         // 생성된 차트 이미지
  }],
  pinnable: boolean          // 대시보드 핀 가능 여부
}
```

## 7. Claude API 프롬프트 설계

### 시스템 프롬프트 (코드 생성용)

```
너는 데이터 분석 에이전트야. 사용자의 질문에 Python 코드로 답변해.

규칙:
1. pandas로 CSV를 읽어서 분석해. 파일 경로는 제공된 경로를 사용해.
2. 결과는 반드시 print()로 출력해.
3. 차트가 필요하면 matplotlib로 생성하고 지정된 경로에 저장해.
4. 코드만 출력해. 설명은 붙이지 마.

사용 가능한 데이터:
{테이블별 컬럼명 + 샘플 5행}
```

### 시스템 프롬프트 (결과 해석용)

```
너는 데이터 분석 에이전트야. 코드 실행 결과를 사용자에게 설명해.

규칙:
1. 핵심 수치를 먼저 말해.
2. 인사이트나 이상한 점이 있으면 언급해.
3. 간결하게 답변해.
```

## 8. 디렉토리 구조

```
csv-analysis-agent/
├── app/
│   ├── page.tsx                 # 메인 레이아웃 (사이드바 + 대시보드 + 채팅)
│   ├── api/
│   │   ├── upload/route.ts      # CSV 업로드 + 자동 분석
│   │   ├── chat/route.ts        # AI 채팅
│   │   └── sessions/
│   │       ├── route.ts         # 세션 목록
│   │       └── [id]/route.ts    # 세션 상세
│   └── components/
│       ├── Sidebar.tsx          # 파일 목록 + 업로드
│       ├── Dashboard.tsx        # 자동 대시보드 + 핀된 차트
│       ├── ChatPanel.tsx        # AI 채팅 인터페이스
│       ├── ChartCard.tsx        # 개별 차트 카드
│       └── FileUpload.tsx       # 드래그앤드롭 업로드
├── lib/
│   ├── claude.ts               # Claude API 호출
│   ├── executor.ts             # Python subprocess 실행
│   ├── metadata.ts             # CSV 메타데이터 추출
│   └── sessions.ts             # 세션 저장/로드 (SQLite)
├── uploads/                    # CSV 파일 저장
├── outputs/                    # 차트 이미지 저장
├── scripts/
│   └── analyze.py              # Python 실행 템플릿
└── package.json
```

## 9. 구현 순서

1. **프로젝트 초기화**: Next.js + TailwindCSS 세팅
2. **CSV 업로드**: 파일 저장 + 메타데이터 추출
3. **Claude API 연동**: 코드 생성 + 결과 해석
4. **Python 실행기**: subprocess로 코드 실행 + 결과 캡처
5. **자동 대시보드**: 업로드 시 자동 분석 + 차트 렌더링
6. **채팅 UI**: 질문-응답 인터페이스
7. **핀 기능**: 채팅 차트를 대시보드에 고정
8. **세션 관리**: 대화 기록 저장/불러오기

## 10. 향후 확장 (MVP 이후)

- **API 연동**: GA4, Meta Ads, Google Ads, AdSense, Amplitude, Supabase
- **사용자 인증**: Supabase Auth
- **클라우드 배포**: Vercel + E2B(코드 샌드박스)
- **멀티 LLM 지원**: OpenAI GPT-4o 옵션 추가
- **공유 기능**: 대시보드/분석 결과를 링크로 공유
- **실시간 데이터**: API 연동 소스의 자동 새로고침
