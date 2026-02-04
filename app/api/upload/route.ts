import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { extractMetadata } from '@/lib/metadata'
import { buildAutoDashboard, generateQuickActions, curateDashboard } from '@/lib/dashboard'
import { runSmartProfile } from '@/lib/profile'
import { inferContext } from '@/lib/briefing'
import { getSessionStore } from '@/lib/sessions'
import type { FileMetadata, DataProfile, QuickAction, DataBriefing } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (files.length === 0) {
      return NextResponse.json({ error: '파일을 선택해주세요' }, { status: 400 })
    }

    const uploadsDir = path.join(process.cwd(), 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    const store = getSessionStore()
    const results: FileMetadata[] = []
    const allCharts: ReturnType<typeof buildAutoDashboard> = []
    let profile: DataProfile | undefined
    let briefing: DataBriefing | undefined
    let quickActions: QuickAction[] = []

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
        sample: meta.sample.slice(0, 5),
        createdAt: new Date().toISOString(),
      }
      results.push(fileMetadata)

      // Persist to SQLite for chat API
      store.registerFile(
        fileId,
        file.name,
        filePath,
        meta.columns.map(c => c.name),
        meta.sample.slice(0, 3),
      )

      // Rule-based auto dashboard (no LLM call)
      const dashboardCharts = buildAutoDashboard({
        fileName: file.name,
        columns: meta.columns,
        rowCount: meta.rowCount,
        sample: meta.sample,
      })
      allCharts.push(...dashboardCharts)

      // Smart Profile (Python pandas profiling)
      profile = await runSmartProfile(fileId, filePath)

      // Quick Actions (rule-based)
      quickActions = generateQuickActions(meta.columns)
    }

    // Context Inference (Haiku — fast + cheap) — single call with all files
    if (results.length > 0) {
      const metaSummary = results.map(f => ({
        name: f.name,
        columns: f.columns.map(c => c.name),
        sample: f.sample,
      }))
      briefing = await inferContext(metaSummary, profile ?? null)
    }

    // 전체 차트에서 핵심 6개만 큐레이션
    const curatedCharts = curateDashboard(allCharts, 6)

    return NextResponse.json({
      data: {
        files: results,
        charts: curatedCharts,
        profile,
        quickActions,
        briefing,
      },
    })
  } catch (error) {
    console.error('[UPLOAD]', error)
    return NextResponse.json({ error: '파일 업로드에 실패했습니다' }, { status: 500 })
  }
}
