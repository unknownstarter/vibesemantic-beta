import { describe, it, expect, beforeEach } from 'vitest'
import { SessionStore } from '@/lib/sessions'

let store: SessionStore

beforeEach(() => {
  store = new SessionStore(':memory:')
})

describe('SessionStore', () => {
  it('should create and retrieve a session', () => {
    const session = store.createSession('Test Session', ['file1'])
    expect(session.title).toBe('Test Session')
    expect(session.fileIds).toEqual(['file1'])

    const retrieved = store.getSession(session.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.title).toBe('Test Session')
  })

  it('should list all sessions', () => {
    store.createSession('Session 1', [])
    store.createSession('Session 2', [])
    const list = store.listSessions()
    expect(list).toHaveLength(2)
  })

  it('should add and retrieve messages', () => {
    const session = store.createSession('Chat', [])
    store.addMessage(session.id, 'user', 'Hello', undefined, undefined)
    store.addMessage(session.id, 'assistant', 'Hi there', undefined, undefined)

    const messages = store.getMessages(session.id)
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('user')
    expect(messages[1].role).toBe('assistant')
  })

  it('should store message with charts and code', () => {
    const session = store.createSession('Analysis', [])
    const charts = [{ id: 'c1', type: 'bar', title: 'Test', data: [] }]
    store.addMessage(session.id, 'assistant', 'Result', JSON.stringify(charts), 'print("hello")')

    const messages = store.getMessages(session.id)
    expect(messages[0].charts).toEqual(charts)
    expect(messages[0].code).toBe('print("hello")')
  })
})

describe('Analysis Cache', () => {
  it('should save and retrieve cache entry', () => {
    const session = store.createSession('Test', [])
    const cache = store.saveCache(
      session.id,
      'outputs/cache/test.parquet',
      '고객별 매출 합계',
      ['customer_id', 'total_sales'],
      1234
    )

    expect(cache.id).toBeDefined()
    expect(cache.sessionId).toBe(session.id)
    expect(cache.description).toBe('고객별 매출 합계')
    expect(cache.columns).toEqual(['customer_id', 'total_sales'])
    expect(cache.rowCount).toBe(1234)

    const retrieved = store.getCache(cache.id)
    expect(retrieved).not.toBeNull()
    expect(retrieved!.description).toBe('고객별 매출 합계')
    expect(retrieved!.columns).toEqual(['customer_id', 'total_sales'])
  })

  it('should list cache entries for a session', () => {
    const session = store.createSession('Test', [])
    store.saveCache(session.id, 'file1.parquet', 'desc1', ['col1'], 10)
    store.saveCache(session.id, 'file2.parquet', 'desc2', ['col2'], 20)

    const caches = store.listCache(session.id)
    expect(caches).toHaveLength(2)
    expect(caches[0].description).toBe('desc1')
    expect(caches[1].description).toBe('desc2')
  })

  it('should return empty list for session with no cache', () => {
    const session = store.createSession('Empty', [])
    const caches = store.listCache(session.id)
    expect(caches).toHaveLength(0)
  })

  it('should return null for non-existent cache id', () => {
    const result = store.getCache('non-existent-id')
    expect(result).toBeNull()
  })
})

describe('Learned Context', () => {
  it('should save and retrieve context', () => {
    const context = {
      fileId: 'file-1',
      columnMeanings: { revenue: '매출', date: '거래일' },
      businessContext: 'B2B SaaS 회사의 매출 데이터',
      knownRelationships: ['revenue와 date는 시계열 관계'],
      previousInsights: ['Q4 매출이 40% 증가'],
      updatedAt: new Date().toISOString(),
    }
    store.saveContext(context)

    const retrieved = store.getContext('file-1')
    expect(retrieved).not.toBeNull()
    expect(retrieved!.fileId).toBe('file-1')
    expect(retrieved!.columnMeanings).toEqual({ revenue: '매출', date: '거래일' })
    expect(retrieved!.businessContext).toBe('B2B SaaS 회사의 매출 데이터')
    expect(retrieved!.knownRelationships).toEqual(['revenue와 date는 시계열 관계'])
    expect(retrieved!.previousInsights).toEqual(['Q4 매출이 40% 증가'])
  })

  it('should update context on re-save', () => {
    const context1 = {
      fileId: 'file-1',
      columnMeanings: { revenue: '매출' },
      businessContext: '초기 컨텍스트',
      knownRelationships: [],
      previousInsights: [],
      updatedAt: new Date().toISOString(),
    }
    store.saveContext(context1)

    const context2 = {
      fileId: 'file-1',
      columnMeanings: { revenue: '매출', cost: '비용' },
      businessContext: '업데이트된 컨텍스트',
      knownRelationships: ['revenue - cost = profit'],
      previousInsights: ['마진율 개선 추세'],
      updatedAt: new Date().toISOString(),
    }
    store.saveContext(context2)

    const retrieved = store.getContext('file-1')
    expect(retrieved!.columnMeanings).toEqual({ revenue: '매출', cost: '비용' })
    expect(retrieved!.businessContext).toBe('업데이트된 컨텍스트')
  })

  it('should return null for non-existent file context', () => {
    const result = store.getContext('non-existent')
    expect(result).toBeNull()
  })

  it('should save and retrieve history summary', () => {
    store.createSession('Test', ['file1'])
    const session = store.listSessions()[0]

    expect(store.getSummary(session.id)).toBeNull()

    store.saveSummary(session.id, '매출 분석에 대한 대화 요약', 8)
    const summary = store.getSummary(session.id)
    expect(summary).not.toBeNull()
    expect(summary!.summary).toBe('매출 분석에 대한 대화 요약')
    expect(summary!.coveredCount).toBe(8)
  })

  it('should update summary on re-save', () => {
    store.createSession('Test', ['file1'])
    const session = store.listSessions()[0]

    store.saveSummary(session.id, '첫 번째 요약', 4)
    store.saveSummary(session.id, '두 번째 요약 (더 긴 대화)', 10)

    const summary = store.getSummary(session.id)
    expect(summary!.summary).toBe('두 번째 요약 (더 긴 대화)')
    expect(summary!.coveredCount).toBe(10)
  })
})
