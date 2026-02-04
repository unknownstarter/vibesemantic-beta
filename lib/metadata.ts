import fs from 'fs/promises'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import type { ColumnInfo, NumericStats } from './types'
import { callClaude, MODEL_INTERPRET } from './claude'

export interface MetadataResult {
  columns: ColumnInfo[]
  rowCount: number
  sample: Record<string, unknown>[]
  headerRow: number   // 감지된 헤더 행 번호 (pandas 등 외부 도구에 전달용)
  dataEndRow: number  // 데이터 끝 행 (exclusive). -1이면 끝까지
  sectionName?: string  // 멀티 섹션 CSV에서 섹션 이름
}

// ========== 값 정규화 ==========

/** CSV 셀 값을 정규화: 천단위 쉼표 제거, 통화 기호 제거, 결측값 처리 */
function normalizeValue(raw: string): unknown {
  const trimmed = raw.trim()

  // 결측값 패턴
  if (
    trimmed === '' ||
    trimmed === '-' ||
    trimmed === '$ -' ||
    trimmed === '₩ -' ||
    trimmed.toLowerCase() === 'n/a' ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'none' ||
    trimmed === '#N/A' ||
    trimmed === '#REF!'
  ) {
    return null
  }

  // 통화 기호 제거 + 천단위 쉼표 제거 → 숫자 시도
  const cleaned = trimmed
    .replace(/^[\$₩€£¥]\s*/, '') // 앞쪽 통화 기호
    .replace(/\s*[\$₩€£¥]$/, '') // 뒤쪽 통화 기호
    .replace(/,/g, '')           // 천단위 구분자
    .replace(/%$/, '')           // 뒤쪽 퍼센트
    .trim()

  if (cleaned !== '' && !isNaN(Number(cleaned)) && isFinite(Number(cleaned))) {
    return Number(cleaned)
  }

  return trimmed
}

// ========== LLM 기반 CSV 구조 감지 (멀티 섹션) ==========

const CSV_STRUCTURE_SYSTEM = `너는 CSV/TSV 파일 구조 분석기야.
주어진 파일의 내용(행 번호 포함)을 보고, 파일 안에 있는 모든 데이터 테이블(섹션)을 찾아.

분석 규칙:
1. Excel 내보내기 CSV는 제목, 설명, 빈 행, 병합셀 잔재가 앞에 올 수 있다.
2. 컬럼 헤더 행 = 실제 데이터 필드명(컬럼명)이 가장 많이 나열된 행.
3. 데이터 시작 행 = 헤더 바로 다음 행.
4. 데이터 끝 행(dataEndRow) = 실제 데이터의 마지막 행 번호 + 1 (exclusive).
   - 요약행(전체, 합계, Total, Sum, 전체 DAU, 전체 유저 등), 메모/주석, ARPDAU, 빈 행은 데이터가 아님.
   - 데이터 행이 끝나면 즉시 dataEndRow를 설정. 요약행까지 포함하지 마.
5. 같은 파일에 여러 테이블이 있으면 각각을 별도 섹션으로 감지해.
6. 각 섹션에 의미 있는 이름(name)을 부여해. 섹션 제목이 주변에 있으면 그걸 쓰고, 없으면 "섹션 1" 등.
7. 헤더가 반복되는 경우(같은 컬럼명이 다시 나타남)도 별도 섹션이야.
8. 한 섹션의 데이터가 이전 섹션과 같은 헤더 구조를 쓰는데 헤더 행이 반복되지 않는 경우, 원래 헤더 행 번호를 headerRow에 써.
9. 헤더가 없는 순수 데이터 파일이면 hasHeader: false.
10. 반드시 순수 JSON만 응답. 마크다운/설명 금지.

{
  "hasHeader": true,
  "sections": [
    { "name": "섹션명", "headerRow": 0, "dataStartRow": 1, "dataEndRow": 10 },
    { "name": "섹션명2", "headerRow": 15, "dataStartRow": 16, "dataEndRow": 25 }
  ]
}`

interface CsvSection {
  name: string
  headerRow: number
  dataStartRow: number
  dataEndRow: number // exclusive
}

interface CsvMultiStructure {
  hasHeader: boolean
  sections: CsvSection[]
}

// 단일 섹션 구조 (휴리스틱 폴백용)
interface CsvStructure {
  headerRow: number
  dataStartRow: number
  dataEndRow: number
  hasHeader: boolean
}

async function detectMultiSectionWithLLM(rawLines: string[]): Promise<CsvMultiStructure> {
  // 전체 파일을 보여줌 (최대 150줄)
  const preview = rawLines
    .slice(0, 150)
    .map((line, i) => `[${i}] ${line}`)
    .join('\n')

  const response = await callClaude({
    model: MODEL_INTERPRET,
    systemBlocks: [{ type: 'text', text: CSV_STRUCTURE_SYSTEM } as TextBlockParam],
    messages: [{ role: 'user', content: preview }],
    maxTokens: 1024,
    temperature: 0,
  })

  const cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON in LLM response')

  const parsed = JSON.parse(match[0])

  if (parsed.hasHeader === false) {
    return { hasHeader: false, sections: [] }
  }

  // 이전 단일 섹션 포맷 호환 (LLM이 sections 없이 응답한 경우)
  if (!parsed.sections && parsed.headerRow != null) {
    return {
      hasHeader: true,
      sections: [{
        name: '전체 데이터',
        headerRow: Number(parsed.headerRow),
        dataStartRow: Number(parsed.dataStartRow ?? Number(parsed.headerRow) + 1),
        dataEndRow: parsed.dataEndRow != null ? Number(parsed.dataEndRow) : -1,
      }],
    }
  }

  const sections: CsvSection[] = (parsed.sections ?? []).map((s: Record<string, unknown>, i: number) => ({
    name: (s.name as string) ?? `섹션 ${i + 1}`,
    headerRow: Number(s.headerRow),
    dataStartRow: Number(s.dataStartRow ?? Number(s.headerRow) + 1),
    dataEndRow: s.dataEndRow != null ? Number(s.dataEndRow) : -1,
  }))

  // 유효한 섹션만 필터
  const validSections = sections.filter(s => {
    if (isNaN(s.headerRow) || s.headerRow < 0 || s.headerRow >= rawLines.length) return false
    return true
  })

  if (validSections.length === 0) {
    throw new Error('No valid sections detected')
  }

  return { hasHeader: true, sections: validSections }
}

// ========== 휴리스틱 폴백 (API 불가 시) ==========

function detectHeaderRowHeuristic(lines: string[]): CsvStructure {
  const maxScan = Math.min(lines.length, 50)
  if (maxScan === 0) return { headerRow: -1, dataStartRow: 0, dataEndRow: -1, hasHeader: false }

  let maxNonEmpty = 0
  for (let i = 0; i < maxScan; i++) {
    const fields = parseCSVLine(lines[i])
    const nonEmpty = fields.filter(f => f.trim() !== '').length
    if (nonEmpty > maxNonEmpty) maxNonEmpty = nonEmpty
  }

  if (maxNonEmpty < 2) return { headerRow: -1, dataStartRow: 0, dataEndRow: -1, hasHeader: false }

  const threshold = Math.max(3, Math.floor(maxNonEmpty * 0.6))
  for (let i = 0; i < maxScan; i++) {
    const fields = parseCSVLine(lines[i])
    const nonEmpty = fields.filter(f => f.trim() !== '').length
    if (nonEmpty >= threshold) {
      return { headerRow: i, dataStartRow: i + 1, dataEndRow: -1, hasHeader: true }
    }
  }

  return { headerRow: -1, dataStartRow: 0, dataEndRow: -1, hasHeader: false }
}

// ========== 섹션 데이터 파싱 (공용) ==========

function parseSectionData(allLines: string[], section: CsvSection): MetadataResult {
  const rawHeaders = parseCSVLine(allLines[section.headerRow])
  const headers = rawHeaders.map((h, i) => h || `Column_${i + 1}`)

  // 중복 헤더명 처리
  const seen = new Map<string, number>()
  const uniqueHeaders = headers.map(h => {
    const count = seen.get(h) ?? 0
    seen.set(h, count + 1)
    return count > 0 ? `${h}_${count + 1}` : h
  })

  // 데이터 행 파싱
  const endLine = section.dataEndRow > 0 ? section.dataEndRow : allLines.length
  const dataLines = allLines.slice(section.dataStartRow, endLine)
  const rows: Record<string, unknown>[] = []
  const namedCount = uniqueHeaders.filter(h => !h.startsWith('Column_')).length
  const minFields = Math.max(2, Math.floor(Math.max(namedCount, 1) * 0.15))

  for (const line of dataLines) {
    if (!line.trim()) continue
    const values = parseCSVLine(line)
    const nonEmpty = values.filter(v => v.trim() !== '').length
    if (nonEmpty < minFields) continue
    const row: Record<string, unknown> = {}
    uniqueHeaders.forEach((h, i) => {
      row[h] = i < values.length ? normalizeValue(values[i]) : null
    })
    rows.push(row)
  }

  const sample = rows.slice(0, 50)

  const columnsToAnalyze = namedCount > 0
    ? uniqueHeaders.filter(h => !h.startsWith('Column_'))
    : uniqueHeaders

  const columns: ColumnInfo[] = columnsToAnalyze.map(name => {
    const values = rows.map(r => r[name])
    const colType = inferType(values)
    const col: ColumnInfo = {
      name,
      type: colType,
      nullCount: values.filter(v => v === null || v === undefined).length,
      uniqueCount: new Set(values.filter(v => v !== null && v !== undefined)).size,
    }

    if (colType === 'number') {
      col.stats = computeNumericStats(values)
    } else if (colType === 'string') {
      col.topValues = computeTopValues(values)
    }

    return col
  })

  return {
    columns,
    rowCount: rows.length,
    sample,
    headerRow: section.headerRow,
    dataEndRow: section.dataEndRow,
    sectionName: section.name,
  }
}

// ========== 멀티 섹션 메타데이터 추출 ==========

export async function extractAllSections(filePath: string): Promise<MetadataResult[]> {
  let content = await fs.readFile(filePath, 'utf-8')
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)

  const allLines = content.split('\n')

  let multiStructure: CsvMultiStructure
  try {
    multiStructure = await detectMultiSectionWithLLM(allLines)
    console.log('[METADATA] LLM detected sections:', JSON.stringify(multiStructure))
  } catch (err) {
    console.warn('[METADATA] LLM multi-section detection failed, using heuristic:', (err as Error).message)
    const single = detectHeaderRowHeuristic(allLines)
    multiStructure = {
      hasHeader: single.hasHeader,
      sections: single.hasHeader ? [{
        name: '전체 데이터',
        headerRow: single.headerRow,
        dataStartRow: single.dataStartRow,
        dataEndRow: single.dataEndRow,
      }] : [],
    }
  }

  if (!multiStructure.hasHeader || multiStructure.sections.length === 0) {
    return [{ ...parseHeaderless(allLines), headerRow: -1, dataEndRow: -1 }]
  }

  return multiStructure.sections.map(section => parseSectionData(allLines, section))
}

// ========== 단일 메타데이터 추출 (하위 호환) ==========

export async function extractMetadata(filePath: string): Promise<MetadataResult> {
  const sections = await extractAllSections(filePath)
  return sections[0]
}

// 헤더 없는 파일 처리
function parseHeaderless(allLines: string[]): Omit<MetadataResult, 'headerRow' | 'dataEndRow'> {
  const nonEmptyLines = allLines.filter(l => l.trim() !== '')
  if (nonEmptyLines.length === 0) return { columns: [], rowCount: 0, sample: [] }

  const firstFields = parseCSVLine(nonEmptyLines[0])
  const headers = firstFields.map((_, i) => `Column_${i + 1}`)
  const rows: Record<string, unknown>[] = []

  for (const line of nonEmptyLines) {
    const values = parseCSVLine(line)
    const row: Record<string, unknown> = {}
    headers.forEach((h, i) => {
      row[h] = i < values.length ? normalizeValue(values[i]) : null
    })
    rows.push(row)
  }

  const sample = rows.slice(0, 50)
  const columns: ColumnInfo[] = headers.map(name => {
    const values = rows.map(r => r[name])
    const colType = inferType(values)
    return {
      name,
      type: colType,
      nullCount: values.filter(v => v === null || v === undefined).length,
      uniqueCount: new Set(values.filter(v => v !== null && v !== undefined)).size,
      ...(colType === 'number' ? { stats: computeNumericStats(values) } : {}),
      ...(colType === 'string' ? { topValues: computeTopValues(values) } : {}),
    }
  })

  return { columns, rowCount: rows.length, sample }
}

// ========== CSV 파싱 유틸 ==========

export function parseCSVLine(line: string): string[] {
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
    .filter(v => v !== null && v !== undefined)
    .map(v => typeof v === 'number' ? v : Number(v))
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
    if (v === null || v === undefined) continue
    const key = String(v)
    freq.set(key, (freq.get(key) ?? 0) + 1)
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }))
}

function inferType(values: unknown[]): ColumnInfo['type'] {
  const nonEmpty = values.filter(v => v !== null && v !== undefined)
  if (nonEmpty.length === 0) return 'string'

  const sample = nonEmpty.slice(0, 20)

  // normalizeValue가 이미 숫자로 변환했으므로 typeof 체크
  if (sample.every(v => typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== ''))) {
    return 'number'
  }

  const datePattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/
  if (sample.every(v => typeof v === 'string' && datePattern.test(v))) return 'date'

  return 'string'
}
