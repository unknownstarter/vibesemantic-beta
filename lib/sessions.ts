import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import type { Session, ChatMessage } from './types'

export class SessionStore {
  private db: Database.Database

  constructor(dbPath: string = 'data/sessions.db') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.migrate()
  }

  private migrate() {
    // Create tables using better-sqlite3's native method for multi-statement SQL
    const setup = `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        file_ids TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        charts_json TEXT,
        code TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    `
    this.db.pragma('journal_mode = WAL')
    // better-sqlite3 requires .exec for multi-statement DDL
    const run = this.db.exec.bind(this.db)
    run(setup)
  }

  createSession(title: string, fileIds: string[]): Session {
    const id = uuid()
    const now = new Date().toISOString()
    this.db.prepare(
      'INSERT INTO sessions (id, title, file_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, title, JSON.stringify(fileIds), now, now)

    return { id, title, fileIds, createdAt: now, updatedAt: now }
  }

  getSession(id: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, string> | undefined
    if (!row) return null
    return {
      id: row.id,
      title: row.title,
      fileIds: JSON.parse(row.file_ids),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  listSessions(): Session[] {
    const rows = this.db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as Record<string, string>[]
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      fileIds: JSON.parse(row.file_ids),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    chartsJson?: string,
    code?: string
  ): ChatMessage {
    const id = uuid()
    const now = new Date().toISOString()
    this.db.prepare(
      'INSERT INTO messages (id, session_id, role, content, charts_json, code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, sessionId, role, content, chartsJson ?? null, code ?? null, now)

    this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId)

    return {
      id,
      sessionId,
      role,
      content,
      charts: chartsJson ? JSON.parse(chartsJson) : undefined,
      code: code ?? undefined,
      createdAt: now,
    }
  }

  getMessages(sessionId: string): ChatMessage[] {
    const rows = this.db.prepare(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'
    ).all(sessionId) as Record<string, string>[]

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      charts: row.charts_json ? JSON.parse(row.charts_json) : undefined,
      code: row.code ?? undefined,
      createdAt: row.created_at,
    }))
  }
}

let store: SessionStore | null = null

export function getSessionStore(): SessionStore {
  if (!store) {
    store = new SessionStore()
  }
  return store
}
