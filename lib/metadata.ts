import fs from 'fs/promises'
import type { ColumnInfo, NumericStats } from './types'

interface MetadataResult {
  columns: ColumnInfo[]
  rowCount: number
  sample: Record<string, unknown>[]
}

export async function extractMetadata(filePath: string): Promise<MetadataResult> {
  let content = await fs.readFile(filePath, 'utf-8')
  // Strip UTF-8 BOM if present
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)
  const lines = content.split('\n').filter(line => line.trim() !== '' && !line.trim().startsWith('#'))

  if (lines.length === 0) {
    return { columns: [], rowCount: 0, sample: [] }
  }

  const headers = parseCSVLine(lines[0])
  const dataLines = lines.slice(1)
  const rows: Record<string, unknown>[] = []

  for (const line of dataLines) {
    const values = parseCSVLine(line)
    const row: Record<string, unknown> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? null })
    rows.push(row)
  }

  const sample = rows.slice(0, 50)
  const columns: ColumnInfo[] = headers.map(name => {
    const values = rows.map(r => r[name])
    const colType = inferType(values)
    const col: ColumnInfo = {
      name,
      type: colType,
      nullCount: values.filter(v => v === null || v === '' || v === undefined).length,
      uniqueCount: new Set(values.filter(v => v !== null && v !== '')).size,
    }

    if (colType === 'number') {
      col.stats = computeNumericStats(values)
    } else if (colType === 'string') {
      col.topValues = computeTopValues(values)
    }

    return col
  })

  return { columns, rowCount: rows.length, sample }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function computeNumericStats(values: unknown[]): NumericStats {
  const nums = values
    .filter(v => v !== null && v !== '' && v !== undefined)
    .map(Number)
    .filter(n => !isNaN(n))

  if (nums.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, std: 0 }
  }

  const sorted = [...nums].sort((a, b) => a - b)
  const sum = nums.reduce((a, b) => a + b, 0)
  const mean = sum / nums.length

  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]

  const variance = nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / nums.length
  const std = Math.sqrt(variance)

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    std: Math.round(std * 100) / 100,
  }
}

function computeTopValues(values: unknown[], limit = 10): Array<{ value: string; count: number }> {
  const freq = new Map<string, number>()
  for (const v of values) {
    if (v === null || v === '' || v === undefined) continue
    const key = String(v)
    freq.set(key, (freq.get(key) ?? 0) + 1)
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }))
}

function inferType(values: unknown[]): ColumnInfo['type'] {
  const nonEmpty = values.filter(v => v !== null && v !== '' && v !== undefined)
  if (nonEmpty.length === 0) return 'string'

  const sample = nonEmpty.slice(0, 20)

  if (sample.every(v => !isNaN(Number(v)))) return 'number'

  const datePattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/
  if (sample.every(v => datePattern.test(String(v)))) return 'date'

  return 'string'
}
