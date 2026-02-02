import type { AnalysisCache, LearnedContext } from './types'
import type { SessionStore } from './sessions'

const CACHE_PATTERN = /CACHED:\s*(\S+)\s*\|\s*columns:\s*\[([^\]]*)\]\s*\|\s*rows:\s*(\d+)/g

export function parseCachedFiles(stdout: string): Array<{ filePath: string; columns: string[]; rowCount: number }> {
  const results: Array<{ filePath: string; columns: string[]; rowCount: number }> = []
  let match
  while ((match = CACHE_PATTERN.exec(stdout)) !== null) {
    const filePath = match[1]
    const columns = match[2]
      .split(',')
      .map(c => c.trim().replace(/['"]/g, ''))
      .filter(c => c.length > 0)
    const rowCount = parseInt(match[3], 10)
    results.push({ filePath, columns, rowCount })
  }
  // Reset regex lastIndex for reuse
  CACHE_PATTERN.lastIndex = 0
  return results
}

export async function cacheResults(
  sessionId: string,
  stdout: string,
  store: SessionStore
): Promise<AnalysisCache[]> {
  const parsed = parseCachedFiles(stdout)
  const caches: AnalysisCache[] = []

  for (const item of parsed) {
    const description = item.filePath.split('/').pop()?.replace('.parquet', '') ?? item.filePath
    const cache = store.saveCache(
      sessionId,
      item.filePath,
      description,
      item.columns,
      item.rowCount
    )
    caches.push(cache)
  }

  return caches
}

export function buildCacheContext(caches: AnalysisCache[]): string {
  if (caches.length === 0) return ''

  const lines = caches.map(c =>
    `- ${c.filePath} (컬럼: ${c.columns.join(', ')}, ${c.rowCount}행): ${c.description}`
  )

  return `이전 분석에서 생성된 데이터:\n${lines.join('\n')}\npd.read_parquet("파일경로")로 읽을 수 있어.`
}

export function buildLearnedContextString(context: LearnedContext | null): string {
  if (!context) return ''

  const parts: string[] = []

  if (context.businessContext) {
    parts.push(`데이터 설명: ${context.businessContext}`)
  }

  const meanings = Object.entries(context.columnMeanings)
  if (meanings.length > 0) {
    parts.push(`컬럼 의미: ${meanings.map(([k, v]) => `${k}=${v}`).join(', ')}`)
  }

  if (context.knownRelationships.length > 0) {
    parts.push(`알려진 관계: ${context.knownRelationships.join('; ')}`)
  }

  if (context.previousInsights.length > 0) {
    parts.push(`이전 인사이트: ${context.previousInsights.slice(-3).join('; ')}`)
  }

  return parts.join('\n')
}

export function mergeContext(
  existing: LearnedContext | null,
  newInsights: string[],
  newMeanings?: Record<string, string>,
  newRelationships?: string[]
): LearnedContext {
  const base: LearnedContext = existing ?? {
    fileId: '',
    columnMeanings: {},
    businessContext: '',
    knownRelationships: [],
    previousInsights: [],
    updatedAt: new Date().toISOString(),
  }

  return {
    ...base,
    columnMeanings: {
      ...base.columnMeanings,
      ...(newMeanings ?? {}),
    },
    knownRelationships: [
      ...base.knownRelationships,
      ...(newRelationships ?? []),
    ],
    previousInsights: [
      ...base.previousInsights,
      ...newInsights,
    ].slice(-10), // 최근 10개만 유지
    updatedAt: new Date().toISOString(),
  }
}
