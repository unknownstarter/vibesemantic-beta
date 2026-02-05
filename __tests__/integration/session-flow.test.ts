import { describe, it, expect, beforeEach } from 'vitest'
import { SessionStore } from '@/lib/sessions'

/**
 * 통합 테스트: 세션 생명주기 전체 플로우
 * 업로드→세션 생성→파일 등록→메시지 저장→세션 조회→업데이트→요약 캐싱
 */

let store: SessionStore

beforeEach(() => {
  store = new SessionStore(':memory:')
})

describe('Session lifecycle integration', () => {
  it('should handle complete upload → chat → restore flow', () => {
    // 1. 파일 등록 (upload route가 하는 일)
    const fileId = 'file-abc'
    store.registerFile(
      fileId,
      'sales.csv',
      '/uploads/sales.csv',
      ['date', 'channel', 'revenue'],
      [{ date: '2024-01', channel: 'web', revenue: 1200 }],
      100,
    )

    // 2. 세션 생성 + 차트/브리핑 저장
    const charts = [
      { id: 'chart-1', type: 'bar', title: '채널별 매출', data: [{ name: 'web', value: 1200 }], xKey: 'name', yKey: 'value' },
    ]
    const briefings = [
      { domain: '마케팅', briefing: '매출 데이터', columnMeanings: {}, keyMetrics: [], warnings: [], suggestedQuestions: [], greeting: '안녕', confirmed: false },
    ]
    const session = store.createSession('매출 분석', [fileId], {
      charts,
      briefings,
    })

    expect(session.id).toBeDefined()
    expect(session.title).toBe('매출 분석')

    // 3. 채팅 메시지 저장 (chat/analyze route가 하는 일)
    store.addMessage(session.id, 'user', '채널별 매출 분석해줘')
    store.addMessage(
      session.id,
      'assistant',
      'Web 채널 매출이 1200만원입니다.',
      JSON.stringify([{ id: 'chart-2', type: 'bar', title: '분석 차트', data: [{ name: 'web', value: 1200 }] }]),
      'import pandas as pd\nprint("결과")',
    )

    // 4. 세션 조회 (sessions/[id] route가 하는 일)
    const retrieved = store.getSession(session.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.fileIds).toEqual([fileId])

    const messages = store.getMessages(session.id)
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[1].role).toBe('assistant')
    expect(messages[1].charts).toHaveLength(1)
    expect(messages[1].code).toBe('import pandas as pd\nprint("결과")')

    // 5. 파일 정보 복원
    const file = store.getFile(fileId)
    expect(file).not.toBeNull()
    expect(file!.name).toBe('sales.csv')
    expect(file!.columns).toEqual(['date', 'channel', 'revenue'])
    expect(file!.rowCount).toBe(100)
  })

  it('should handle session update with pinned charts', () => {
    const session = store.createSession('Test', ['f1'])

    // 핀 차트 추가
    const pinnedCharts = [
      { id: 'p1', type: 'pie', title: 'Pinned', data: [{ name: 'A', value: 50 }] },
    ]
    store.updateSession(session.id, { pinnedCharts })

    const updated = store.getSession(session.id)
    expect(updated!.pinnedChartsJson).toHaveLength(1)
    expect((updated!.pinnedChartsJson as { title: string }[])[0].title).toBe('Pinned')
  })

  it('should handle history summary caching across conversation', () => {
    const session = store.createSession('Long Chat', ['f1'])

    // 긴 대화 시뮬레이션 (12메시지)
    for (let i = 0; i < 6; i++) {
      store.addMessage(session.id, 'user', `질문 ${i + 1}`)
      store.addMessage(session.id, 'assistant', `답변 ${i + 1}`)
    }

    const messages = store.getMessages(session.id)
    expect(messages).toHaveLength(12)

    // 요약 저장 (compressHistory가 하는 일)
    store.saveSummary(session.id, '사용자가 매출 데이터를 6번 분석함', 2)

    // 요약 조회
    const summary = store.getSummary(session.id)
    expect(summary).not.toBeNull()
    expect(summary!.summary).toContain('6번 분석')
    expect(summary!.coveredCount).toBe(2)

    // 요약 갱신 (더 많은 대화 후)
    store.saveSummary(session.id, '매출 분석 진행, 채널별 비교 완료', 8)
    const updated = store.getSummary(session.id)
    expect(updated!.coveredCount).toBe(8)
  })

  it('should list sessions ordered by updated_at desc', () => {
    const s1 = store.createSession('First', ['f1'])
    const s2 = store.createSession('Second', ['f2'])

    // s1에 메시지 추가 → updated_at 갱신
    store.addMessage(s1.id, 'user', '질문')

    const sessions = store.listSessions()
    expect(sessions).toHaveLength(2)
    // s1이 더 최근에 업데이트됨 → 첫 번째
    expect(sessions[0].id).toBe(s1.id)
    expect(sessions[1].id).toBe(s2.id)
  })

  it('should handle analysis cache lifecycle', () => {
    const session = store.createSession('Cache Test', ['f1'])

    // 분석 캐시 저장
    const cache = store.saveCache(
      session.id,
      'outputs/cache/monthly_revenue.parquet',
      '월별 매출 집계 데이터',
      ['month', 'total_revenue'],
      12,
    )
    expect(cache.id).toBeDefined()
    expect(cache.filePath).toContain('monthly_revenue')

    // 캐시 목록 조회
    const caches = store.listCache(session.id)
    expect(caches).toHaveLength(1)
    expect(caches[0].description).toBe('월별 매출 집계 데이터')
    expect(caches[0].columns).toEqual(['month', 'total_revenue'])
    expect(caches[0].rowCount).toBe(12)
  })

  it('should handle learned context save and update', () => {
    // 첫 번째 컨텍스트
    store.saveContext({
      fileId: 'f1',
      columnMeanings: { revenue: '매출' },
      businessContext: 'B2B SaaS',
      knownRelationships: [],
      previousInsights: ['Q4 매출 증가'],
      updatedAt: new Date().toISOString(),
    })

    const ctx1 = store.getContext('f1')
    expect(ctx1!.businessContext).toBe('B2B SaaS')
    expect(ctx1!.previousInsights).toEqual(['Q4 매출 증가'])

    // 업데이트
    store.saveContext({
      fileId: 'f1',
      columnMeanings: { revenue: '매출', cost: '비용' },
      businessContext: 'B2B SaaS — 비용 분석 추가',
      knownRelationships: ['revenue - cost = profit'],
      previousInsights: ['Q4 매출 증가', '비용 절감 가능'],
      updatedAt: new Date().toISOString(),
    })

    const ctx2 = store.getContext('f1')
    expect(ctx2!.columnMeanings).toHaveProperty('cost')
    expect(ctx2!.previousInsights).toHaveLength(2)
  })
})
