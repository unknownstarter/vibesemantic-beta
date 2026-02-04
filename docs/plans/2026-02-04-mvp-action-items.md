# MVP 고도화 액션 아이템 (2026-02-04)

## 현재 상태 요약

- 멀티 섹션 CSV 자동 감지 + 교차 비교 차트 구현 완료
- 대시보드 소스별 그룹핑 + 접기/펼치기 구현 완료
- 브리핑 누적 + 차트 소스별 보존 구현 완료
- 멀티 업로드 상태 관리 안정화 완료
- 빌드 성공, 95개 단위 테스트 전체 통과

---

## 우선순위별 액션 아이템

### P0. 세션 영속화 (가장 급함)

**문제**: 페이지 새로고침 시 파일, 차트, 브리핑, 대화 기록 전부 소실. 실사용 불가능.

**현황**:
- `lib/sessions.ts`에 SQLite 세션 테이블 존재 (sessions, messages, files, file_context)
- `app/api/sessions/` API 라우트 존재 (목록, 상세 조회)
- 프론트엔드(`app/page.tsx`)는 전부 in-memory useState → 새로고침 시 초기화

**구현 방향**:
- [ ] 페이지 로드 시 마지막 세션 자동 복원 (파일 목록, 차트, 브리핑)
- [ ] 업로드 시 세션 자동 생성/업데이트 (차트 JSON, 브리핑 JSON 포함)
- [ ] 채팅 메시지 실시간 SQLite 저장 (현재 `addMessage` 메서드 존재, 연결만 필요)
- [ ] 세션 전환 UI (사이드바에서 이전 세션 목록 표시)
- [ ] URL 기반 세션 라우팅 검토 (`/session/[id]` 또는 query param)

**영향 범위**: `app/page.tsx`, `app/components/Sidebar.tsx`, `app/api/sessions/`

---

### P1. 자동 대시보드 차트 품질 개선

**문제**: 규칙 기반(`lib/dashboard.ts`)이라 데이터 특성을 무시한 무의미한 차트 생성됨.

**현황**:
- `buildAutoDashboard()`: 카테고리×메트릭, 스케일 비교 등 3가지 패턴만 존재
- `curateDashboard()`: 우선순위 정렬 + 소스 다양성만 고려
- 데이터의 실질적 분석 가치 판단 없음

**구현 방향**:
- [ ] LLM 기반 차트 추천: 메타데이터(컬럼명, 타입, 샘플 5행)을 Haiku에 전달 → "의미 있는 차트 3개 추천" → Recharts JSON 응답
- [ ] 규칙 기반은 폴백으로 유지 (LLM 실패 시, 비용 절감 옵션)
- [ ] 추천 근거(insight) 함께 표시: "이 차트는 채널별 전환율 차이가 2배 이상이라 중요합니다"
- [ ] 비용 목표: Haiku 1회 호출 ~5원 추가

**영향 범위**: `lib/dashboard.ts`, `app/api/upload/route.ts`

---

### P2. 채팅 분석 → Recharts 인터랙티브 차트 전환

**문제**: 채팅 분석 결과가 matplotlib 정적 PNG 이미지로 나옴. 대시보드와 스타일 불일치, 클릭 인터랙션 불가.

**현황**:
- `lib/agent.ts` + `lib/executor.ts`: Python 코드 생성 → subprocess 실행 → PNG 파일 생성
- `app/components/ChartCard.tsx`: Recharts 기반 인터랙티브 차트 렌더링 가능
- 채팅에서 핀해도 이미지만 대시보드에 올라감

**구현 방향**:
- [ ] LLM 프롬프트 변경: "matplotlib 코드 대신 Recharts용 JSON 데이터를 생성하라"
- [ ] 응답 포맷: `{ type: 'bar', title: '...', data: [...], xKey, yKey }`
- [ ] Python 실행은 데이터 가공용으로만 사용 (집계, 통계), 시각화는 프론트엔드
- [ ] 기존 이미지 차트는 폴백으로 유지 (복잡한 시각화용)

**영향 범위**: `lib/claude.ts` (프롬프트), `lib/agent.ts`, `app/components/ResearchPanel.tsx`

---

### P3. 대화 이력 압축

**문제**: 10턴 이상 대화 시 토큰 폭증. 현재 전체 이력을 매번 전송.

**현황**:
- `app/api/chat/route.ts`: `history` 배열을 그대로 프롬프트에 포함
- 압축 로직 미구현 (설계만 존재)

**구현 방향**:
- [ ] 10턴 초과 시 이전 대화를 Haiku로 요약 (3-5문장)
- [ ] 요약 + 최근 5턴만 프롬프트에 포함
- [ ] 요약 결과 캐싱 (동일 세션 내 재요약 방지)
- [ ] 비용 목표: 요약 1회 ~3원, 이후 매 요청 토큰 50-70% 절감

**영향 범위**: `lib/claude.ts`, `app/api/chat/route.ts`, `app/api/analyze/route.ts`

---

## 향후 로드맵 (MVP 이후)

| 단계 | 항목 | 비고 |
|------|------|------|
| v1.1 | Google Sheets 연동 | OAuth, CSV 대체, 진입장벽 최소화 |
| v1.2 | Supabase/PostgreSQL 연동 | SQL 직접 실행, 구조화된 결과 |
| v1.3 | GA4 Reporting API 연동 | 마케팅 유저 핵심 니즈 |
| v1.4 | MCP 스타일 커넥터 프레임워크 | 외부 소스 표준화된 연동 패턴 |
| v2.0 | 멀티 소스 크로스 분석 | GA4 + DB + CSV 조합 인사이트 |

## 기술 부채

- [ ] API 라우트 통합 테스트 작성
- [ ] `npm run lint` 경고 정리
- [ ] Python 가상환경 경로 하드코딩 제거 (`.venv/bin/python3`)
- [ ] 대화 이력 10턴 이상 시 성능 저하 모니터링
