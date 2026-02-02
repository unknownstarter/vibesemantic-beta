import fs from 'fs/promises'
import type { ColumnInfo } from './types'

interface MetadataResult {
  columns: ColumnInfo[]
  rowCount: number
  sample: Record<string, unknown>[]
}

export async function extractMetadata(filePath: string): Promise<MetadataResult> {
  const content = await fs.readFile(filePath, 'utf-8')
  const lines = content.split('\n').filter(line => line.trim() !== '')

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

  const sample = rows.slice(0, 5)
  const columns: ColumnInfo[] = headers.map(name => {
    const values = rows.map(r => r[name])
    return {
      name,
      type: inferType(values),
      nullCount: values.filter(v => v === null || v === '' || v === undefined).length,
      uniqueCount: new Set(values.filter(v => v !== null && v !== '')).size,
    }
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

function inferType(values: unknown[]): ColumnInfo['type'] {
  const nonEmpty = values.filter(v => v !== null && v !== '' && v !== undefined)
  if (nonEmpty.length === 0) return 'string'

  const sample = nonEmpty.slice(0, 20)

  if (sample.every(v => !isNaN(Number(v)))) return 'number'

  const datePattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/
  if (sample.every(v => datePattern.test(String(v)))) return 'date'

  return 'string'
}
