import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import type { Session, ChatMessage, AnalysisCache, LearnedContext } from './types'

export class SessionStore {
  private db: Database.Database

  constructor(dbPath: string = 'data/sessions.db') {
    const dir = path.dirname(dbPath)
    if (dir !== ':memory:' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.migrate()
  }

  private migrate() {
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
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        columns_json TEXT NOT NULL,
        sample_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS analysis_cache (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        description TEXT NOT NULL,
        columns_json TEXT NOT NULL,
        row_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS file_context (
        file_id TEXT PRIMARY KEY,
        column_meanings TEXT NOT NULL DEFAULT '{}',
        business_context TEXT DEFAULT '',
        known_relationships TEXT NOT NULL DEFAULT '[]',
        previous_insights TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      );
    `
    this.db.exec(setup)
  }

  registerFile(id: string, name: string, filePath: string, columns: string[], sample: Record<string, unknown>[]): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO files (id, name, path, columns_json, sample_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name, filePath, JSON.stringify(columns), JSON.stringify(sample), new Date().toISOString())
  }

  getFile(id: string): { name: string; path: string; columns: string[]; sample: Record<string, unknown>[] } | null {
    const row = this.db.prepare('SELECT * FROM files WHERE id = ?').get(id) as Record<string, string> | undefined
    if (!row) return null
    return {
      name: row.name,
      path: row.path,
      columns: JSON.parse(row.columns_json),
      sample: JSON.parse(row.sample_json),
    }
  }

  listFiles(): Array<{ id: string; name: string; columns: string[]; sample: Record<string, unknown>[] }> {
    const rows = this.db.prepare('SELECT id, name, columns_json, sample_json FROM files ORDER BY created_at ASC').all() as Record<string, string>[]
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      columns: JSON.parse(row.columns_json),
      sample: JSON.parse(row.sample_json),
    }))
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

  // ========== Analysis Cache ==========

  saveCache(sessionId: string, filePath: string, description: string, columns: string[], rowCount: number): AnalysisCache {
    const id = uuid()
    const now = new Date().toISOString()
    this.db.prepare(
      'INSERT INTO analysis_cache (id, session_id, file_path, description, columns_json, row_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, sessionId, filePath, description, JSON.stringify(columns), rowCount, now)
    return { id, sessionId, filePath, description, columns, rowCount, createdAt: now }
  }

  getCache(id: string): AnalysisCache | null {
    const row = this.db.prepare('SELECT * FROM analysis_cache WHERE id = ?').get(id) as Record<string, string> | undefined
    if (!row) return null
    return {
      id: row.id,
      sessionId: row.session_id,
      filePath: row.file_path,
      description: row.description,
      columns: JSON.parse(row.columns_json),
      rowCount: Number(row.row_count),
      createdAt: row.created_at,
    }
  }

  listCache(sessionId: string): AnalysisCache[] {
    const rows = this.db.prepare(
      'SELECT * FROM analysis_cache WHERE session_id = ? ORDER BY created_at ASC'
    ).all(sessionId) as Record<string, string>[]
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      filePath: row.file_path,
      description: row.description,
      columns: JSON.parse(row.columns_json),
      rowCount: Number(row.row_count),
      createdAt: row.created_at,
    }))
  }

  // ========== Learned Context ==========

  saveContext(context: LearnedContext): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO file_context (file_id, column_meanings, business_context, known_relationships, previous_insights, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      context.fileId,
      JSON.stringify(context.columnMeanings),
      context.businessContext,
      JSON.stringify(context.knownRelationships),
      JSON.stringify(context.previousInsights),
      context.updatedAt
    )
  }

  getContext(fileId: string): LearnedContext | null {
    const row = this.db.prepare('SELECT * FROM file_context WHERE file_id = ?').get(fileId) as Record<string, string> | undefined
    if (!row) return null
    return {
      fileId: row.file_id,
      columnMeanings: JSON.parse(row.column_meanings),
      businessContext: row.business_context ?? '',
      knownRelationships: JSON.parse(row.known_relationships),
      previousInsights: JSON.parse(row.previous_insights),
      updatedAt: row.updated_at,
    }
  }
}

let store: SessionStore | null = null

export function getSessionStore(): SessionStore {
  if (!store) {
    store = new SessionStore()
  }
  return store
}
