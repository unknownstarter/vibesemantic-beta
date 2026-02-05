# P2. 채팅 분석 → Recharts 인터랙티브 차트 전환 (2026-02-05)

## 변경 요약

채팅 분석 결과를 matplotlib 정적 PNG 이미지에서 Recharts 인터랙티브 차트로 전환.
복잡한 시각화(히트맵, 산점도 등)는 기존 matplotlib PNG 폴백 유지.

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `lib/prompts.ts` | STEP_CODER 프롬프트에 `RECHARTS_JSON:` 출력 규칙 추가. matplotlib는 복잡한 시각화 전용 폴백으로 강등 |
| `lib/agent.ts` | `parseRechartsCharts()` — stdout에서 `RECHARTS_JSON:` 라인 파싱. `buildChartsFromResult()` — Recharts + 이미지 차트 통합 빌드. executeStep/runFastPath 프롬프트에서 RECHARTS_JSON 우선 지시. synthesizer 전달 시 RECHARTS_JSON 라인 제거 |
| `app/components/ResearchPanel.tsx` | `data[]` 있는 차트 → `ChartCard` (Recharts) 렌더링. `imageUrl`만 있는 차트 → 기존 `<img>` 유지. 차트 클릭 → 드릴다운 질문 자동 전송 연결 |
| `__tests__/lib/agent.test.ts` | `parseRechartsCharts` 6개 테스트 추가 |

## 동작 흐름

```
사용자 질문
  → LLM이 Python 코드 생성 (데이터 집계 + RECHARTS_JSON 출력)
  → Python 실행 → stdout에 RECHARTS_JSON:{...} 라인 포함
  → parseRechartsCharts()가 stdout 파싱 → ChartData 객체 생성
  → ResearchPanel이 ChartCard (Recharts)로 인터랙티브 렌더링
  → 차트 클릭 시 드릴다운 질문 자동 전송
  → Pin 시 대시보드에 인터랙티브 차트로 추가
```

## RECHARTS_JSON 프로토콜

Python stdout에서 다음 형태의 라인을 파싱:

```
RECHARTS_JSON:{"type":"bar","title":"월별 매출","data":[{"month":"1월","revenue":1200},...],"xKey":"month","yKey":"revenue"}
```

- `type`: `bar` | `line` | `pie` | `summary`
- `data`: 최대 20개 항목 배열
- `xKey` / `yKey`: 데이터 키 지정
- 여러 차트 출력 시 RECHARTS_JSON: 라인을 여러 번 출력

## 테스트 결과

- 전체 101개 테스트 통과 (기존 95 + 신규 6)
- 빌드 성공

## 미완료 / 후속 작업

- [ ] 실제 CSV 업로드 → 채팅 질문 E2E 검증
- [ ] 채팅 패널(520px) 내 차트 크기/여백 최적화
- [ ] 핀 → 대시보드 인터랙티브 차트 연동 확인
