# P2/P3 검증 체크리스트 (2026-02-05)

## P2. Recharts 인터랙티브 차트 검증

### E2E 기능 검증
- [ ] CSV 업로드 → 채팅 질문 → RECHARTS_JSON이 stdout에 출력되는지
- [ ] 파싱된 ChartData의 type/data/xKey/yKey가 올바른지
- [ ] ChartCard가 520px ResearchPanel 안에서 정상 렌더링되는지
- [ ] 차트 호버 시 Tooltip 정상 동작
- [ ] 차트 클릭 → 드릴다운 질문 자동 전송 → 후속 분석 동작
- [ ] Pin 버튼 → 대시보드에 인터랙티브 차트로 추가되는지
- [ ] matplotlib 폴백: 복잡한 시각화 질문 시 PNG 이미지 정상 생성

### LLM 안정성 검증
- [ ] 다양한 질문 유형별 RECHARTS_JSON 출력 안정성 (분포, 추세, 비교, 비율)
- [ ] JSON 파싱 실패 시 graceful fallback (에러 없이 텍스트만 표시)
- [ ] 데이터 항목 20개 초과 시 차트 가독성

### UI/UX 검증
- [ ] 520px 패널 내 ChartCard 레이아웃 (여백, 헤더, 버튼 크기)
- [ ] 대시보드 차트와 채팅 차트의 시각적 일관성
- [ ] 다크 테마에서 Tooltip 색상 (현재 흰색 하드코딩)

## P3. 대화 이력 압축 검증

### 기능 검증
- [ ] 10메시지 이하 대화: 압축 없이 원본 전달
- [ ] 11메시지 이상 대화: Haiku 요약 호출 확인
- [ ] 요약 캐시: 동일 세션에서 재요청 시 LLM 재호출 없이 캐시 사용
- [ ] 요약 품질: 핵심 분석 결과/컨텍스트가 유지되는지

### 비용 검증
- [ ] 요약 1회 토큰 사용량 측정 (~3원 목표)
- [ ] 압축 전후 프롬프트 토큰 비교 (50-70% 절감 목표)

## P2 bonus: chat route에도 Recharts 적용
- [ ] legacy chat API(`/api/chat`)에서도 RECHARTS_JSON 파싱 동작
- [ ] legacy chat에서도 차트 생성 프롬프트가 RECHARTS_JSON 우선으로 동작
