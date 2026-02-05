# P0 세션 영속화 설계 (2026-02-05)

## 목표
페이지 새로고침 시 파일, 차트, 브리핑, 프로필, 퀵액션, 대화 기록이 모두 복원되도록 한다.

## 범위
- 새로고침 복원 (마지막 세션 자동 로드)
- 채팅 메시지 DB 저장
- 세션 전환 UI, URL 라우팅은 이번 범위 아님

## 현황
- `lib/sessions.ts`에 SQLite 테이블 5개 + CRUD 메서드 구현 완료
- `files`, `analysis_cache`, `file_context` 테이블은 실제 사용 중
- `sessions`, `messages` 테이블은 구현되어 있으나 **미사용**
- 프론트엔드는 전부 in-memory useState로 관리

---

## 1. 데이터 모델 (sessions 테이블 확장)

```sql
sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  file_ids TEXT NOT NULL DEFAULT '[]',
  charts_json TEXT NOT NULL DEFAULT '[]',        -- ChartData[]
  pinned_charts_json TEXT NOT NULL DEFAULT '[]',  -- ChartData[]
  briefings_json TEXT NOT NULL DEFAULT '[]',      -- DataBriefing[]
  profile_json TEXT DEFAULT NULL,                 -- DataProfile | null
  quick_actions_json TEXT NOT NULL DEFAULT '[]',  -- QuickAction[]
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

messages 테이블은 변경 없음 (이미 charts_json, code 컬럼 존재).

---

## 2. API 변경

### POST /api/upload
- 세션 생성 (첫 업로드) 또는 세션 업데이트 (추가 업로드)
- 요청에 `sessionId` 포함 가능 (추가 업로드 시)
- 응답에 `sessionId` 포함
- 차트/브리핑/프로필/퀵액션을 세션에 저장

### POST /api/chat
- 요청에 `sessionId` 추가
- 사용자 메시지 + AI 응답을 `messages` 테이블에 저장

### POST /api/analyze
- 실제 `sessionId` 전달받아 메시지 저장 (현재 `'default'` 폴백 제거)

### GET /api/sessions/:id (확장)
- 세션 상세에 charts, briefings, profile, quickActions, pinned 포함

### PATCH /api/sessions/:id (신규)
- 핀 차트 변경 등 부분 업데이트용

---

## 3. 프론트엔드 변경

### app/page.tsx
- `sessionId` state 추가
- 페이지 로드 시 `useEffect`: 최근 세션 조회 → 전체 상태 복원
- 업로드 응답에서 `sessionId` 저장
- 채팅/분석 API 호출 시 `sessionId` 전달
- 핀 변경 시 PATCH API 호출

### 변경하지 않는 것
- Sidebar 세션 목록 UI
- URL 라우팅 (/session/[id])
- 세션 삭제/이름 변경

---

## 4. 구현 순서

1. `lib/sessions.ts` — 테이블 스키마 확장 + 새 메서드 추가
2. `app/api/sessions/[id]/route.ts` — GET 확장 + PATCH 추가
3. `app/api/upload/route.ts` — 세션 생성/업데이트 로직
4. `app/api/chat/route.ts` — 메시지 저장 로직
5. `app/api/analyze/route.ts` — sessionId 연결
6. `app/page.tsx` — sessionId state + 복원 로직 + API 연결
7. 테스트 + 빌드 검증
