import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { extractMetadata } from '@/lib/metadata'
import { generateCode } from '@/lib/claude'
import { executePython, validateCode } from '@/lib/executor'
import type { FileMetadata, ChartData } from '@/lib/types'

// In-memory file registry for chat API to reference
export const fileRegistry = new Map<string, {
  name: string
  path: string
  columns: string[]
  sample: Record<string, unknown>[]
}>()

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (files.length === 0) {
      return NextResponse.json({ error: '파일을 선택해주세요' }, { status: 400 })
    }

    const uploadsDir = path.join(process.cwd(), 'uploads')
    const outputsDir = path.join(process.cwd(), 'outputs')
    await mkdir(uploadsDir, { recursive: true })
    await mkdir(outputsDir, { recursive: true })

    const results: FileMetadata[] = []
    const allCharts: ChartData[] = []

    for (const file of files) {
      if (!file.name.endsWith('.csv')) continue

      const fileId = uuid()
      const filePath = path.join(uploadsDir, `${fileId}.csv`)
      const buffer = Buffer.from(await file.arrayBuffer())
      await writeFile(filePath, buffer)

      const meta = await extractMetadata(filePath)
      const fileMetadata: FileMetadata = {
        id: fileId,
        name: file.name,
        path: filePath,
        columns: meta.columns,
        rowCount: meta.rowCount,
        sample: meta.sample,
        createdAt: new Date().toISOString(),
      }
      results.push(fileMetadata)

      // Register for chat API
      fileRegistry.set(fileId, {
        name: file.name,
        path: filePath,
        columns: meta.columns.map(c => c.name),
        sample: meta.sample.slice(0, 3),
      })

      // Auto-generate dashboard
      try {
        const metaSummary = [{
          name: file.name,
          columns: meta.columns.map(c => c.name),
          sample: meta.sample.slice(0, 3),
        }]

        const autoPrompt = `이 CSV 파일을 분석해서 자동 대시보드를 생성해줘.
파일 경로: ${filePath}
출력 이미지 경로 패턴: ${outputsDir}/${uuid()}.png

다음을 수행해:
1. 요약 통계를 print로 JSON 출력해: [{"type":"summary","title":"파일명 요약","data":[{"label":"총 행 수","value":"숫자"},{"label":"컬럼 수","value":"숫자"}]}]
2. 수치형 컬럼이 있으면 히스토그램이나 바차트 데이터도 JSON에 포함해

전체 결과를 하나의 JSON 배열로 print해.`

        const code = await generateCode(metaSummary, [], autoPrompt)
        const validation = validateCode(code)

        if (validation.safe) {
          const result = await executePython(code, uploadsDir, 30000)
          if (result.exitCode === 0 && result.stdout.trim()) {
            try {
              const parsed = JSON.parse(result.stdout.trim())
              if (Array.isArray(parsed)) {
                for (const chart of parsed) {
                  allCharts.push({
                    id: uuid(),
                    type: chart.type || 'bar',
                    title: chart.title || '자동 분석',
                    data: chart.data || [],
                    xKey: chart.xKey,
                    yKey: chart.yKey,
                    imageUrl: chart.imageUrl,
                  })
                }
              }
            } catch {
              // Fallback summary
              allCharts.push(createFallbackSummary(file.name, meta.rowCount, meta.columns.length))
            }
          } else {
            allCharts.push(createFallbackSummary(file.name, meta.rowCount, meta.columns.length))
          }
        }
      } catch (err) {
        console.error('[UPLOAD] Auto-analysis failed:', err)
        allCharts.push(createFallbackSummary(file.name, meta.rowCount, meta.columns.length))
      }
    }

    return NextResponse.json({ data: { files: results, charts: allCharts } })
  } catch (error) {
    console.error('[UPLOAD]', error)
    return NextResponse.json({ error: '파일 업로드에 실패했습니다' }, { status: 500 })
  }
}

function createFallbackSummary(name: string, rowCount: number, colCount: number): ChartData {
  return {
    id: uuid(),
    type: 'summary',
    title: `${name} 요약`,
    data: [
      { label: '총 행 수', value: String(rowCount.toLocaleString()) },
      { label: '컬럼 수', value: String(colCount) },
    ],
  }
}
