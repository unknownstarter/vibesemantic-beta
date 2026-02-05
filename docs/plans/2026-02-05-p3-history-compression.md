# P3. 대화 이력 압축 (2026-02-05)

## 변경 요약

10턴(10메시지) 초과 대화 시 이전 이력을 Haiku로 요약하여 토큰 사용량 50-70% 절감.
요약 결과는 SQLite에 캐싱하여 동일 세션 내 재요약 방지.

## 동작 방식

```
대화 이력 14메시지:
  [msg0, msg1, msg2, msg3, | msg4~msg13 (최근 10개)]
         ↓ Haiku 요약
  "[이전 대화 요약] 사용자가 매출 분석을 진행..."

최종 프롬프트:
  [요약 메시지(1개)] + [최근 10메시지] = 11메시지만 전송
```

- 임계값: 10메시지 초과 시 압축 트리거
- 유지: 최근 10메시지 (5 user+assistant 턴)
- 요약: 그 이전 메시지를 Haiku로 3-5문장 압축
- 캐싱: `history_summaries` 테이블에 세션별 요약 + covered_count 저장
- 재요약 방지: cached.coveredCount >= toCompress.length이면 캐시 재사용

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `lib/claude.ts` | `compressHistory()` 함수 추가. 임계값 판단 → 캐시 확인 → Haiku 요약 → 캐시 저장 |
| `lib/sessions.ts` | `history_summaries` 테이블 추가. `getSummary()` / `saveSummary()` 메서드 추가 |
| `app/api/analyze/route.ts` | `runAgentLoop` 호출 전 `compressHistory()` 적용 |
| `app/api/chat/route.ts` | `generateCode` 호출 전 `compressHistory()` 적용. P2 Recharts 파싱도 반영 |
| `__tests__/lib/claude.test.ts` | `compressHistory` 3개 테스트 추가 (미만/일치 시 패스스루, 캐시 재사용) |
| `__tests__/lib/sessions.test.ts` | `getSummary`/`saveSummary` 2개 테스트 추가 |

## 비용 영향

- 요약 1회: Haiku ~3원
- 이후 매 요청: 기존 전체 이력 대신 요약(~200토큰) + 최근 10메시지만 전송
- 20턴 대화 기준 토큰 50-70% 절감 예상

## 테스트 결과

- 전체 106개 테스트 통과 (기존 101 + 신규 5)
- 빌드 성공
