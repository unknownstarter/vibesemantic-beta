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
