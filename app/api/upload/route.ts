import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { extractAllSections } from '@/lib/metadata'
import { buildLLMDashboard, buildCrossSectionCharts, generateQuickActions, curateDashboard } from '@/lib/dashboard'
import { runSmartProfile } from '@/lib/profile'
import { inferContext } from '@/lib/briefing'
import { getSessionStore } from '@/lib/sessions'
import type { FileMetadata, DataProfile, QuickAction, DataBriefing, ChartData, ColumnInfo } from '@/lib/types'

// ScoredChart type from dashboard (internal use)
interface ScoredChart extends ChartData {
  _priority: number
  _source: string
}

// SSE Event Types
export type UploadEvent =
  | { type: 'status'; data: { step: 'uploading' | 'parsing' | 'profiling' | 'briefing' | 'charts' | 'complete'; message: string; progress?: { current: number; total: number } } }
  | { type: 'file'; data: FileMetadata }
  | { type: 'chart'; data: { chart: ChartData; index: number; total: number } }
  | { type: 'briefing'; data: { briefing: DataBriefing; partial: boolean } }
  | { type: 'complete'; data: { sessionId: string; files: FileMetadata[]; charts: ChartData[]; profiles: DataProfile[]; quickActions: QuickAction[]; briefing?: DataBriefing } }
  | { type: 'error'; data: { message: string } }

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || ''

  // Check if client wants SSE streaming
  const acceptsStream = request.headers.get('accept')?.includes('text/event-stream')

  // If not streaming, use legacy JSON response
  if (!acceptsStream) {
    return handleLegacyUpload(request)
  }

  // SSE Streaming response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: UploadEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        const formData = await request.formData()
        const files = formData.getAll('files') as File[]
        const existingSessionId = formData.get('sessionId') as string | null

        if (files.length === 0) {
          send({ type: 'error', data: { message: '파일을 선택해주세요' } })
          controller.close()
          return
        }

        send({ type: 'status', data: { step: 'uploading', message: '파일 업로드 중...' } })

        const uploadsDir = path.join(process.cwd(), 'uploads')
        await mkdir(uploadsDir, { recursive: true })

        const store = getSessionStore()
        const results: FileMetadata[] = []
        const allCharts: ScoredChart[] = []
        const profiles: DataProfile[] = []
        let briefing: DataBriefing | undefined
        let quickActions: QuickAction[] = []

        const dashboardInputs: Array<{ fileName: string; columns: ColumnInfo[]; rowCount: number; sample: Record<string, unknown>[] }> = []
        const crossSectionData: Array<{ sections: Awaited<ReturnType<typeof extractAllSections>>; fileName: string }> = []

        // Phase 1: Parse files
        send({ type: 'status', data: { step: 'parsing', message: '파일 분석 중...', progress: { current: 0, total: files.length } } })

        let fileIndex = 0
        for (const file of files) {
          if (!file.name.endsWith('.csv')) continue

          const fileId = uuid()
          const filePath = path.join(uploadsDir, `${fileId}.csv`)
          const buffer = Buffer.from(await file.arrayBuffer())
          await writeFile(filePath, buffer)

          const sections = await extractAllSections(filePath)

          for (const section of sections) {
            const sectionId = uuid()
            const displayName = sections.length > 1 && section.sectionName
              ? `${file.name} — ${section.sectionName}`
              : file.name

            const fileMetadata: FileMetadata = {
              id: sectionId,
              name: displayName,
              path: filePath,
              columns: section.columns,
              rowCount: section.rowCount,
              sample: section.sample.slice(0, 5),
              createdAt: new Date().toISOString(),
            }
            results.push(fileMetadata)

            // Send file event immediately
            send({ type: 'file', data: fileMetadata })

            store.registerFile(
              sectionId,
              displayName,
              filePath,
              section.columns.map(c => c.name),
              section.sample.slice(0, 3),
              section.rowCount,
            )

            dashboardInputs.push({
              fileName: displayName,
              columns: section.columns,
              rowCount: section.rowCount,
              sample: section.sample,
            })

            // Profile
            send({ type: 'status', data: { step: 'profiling', message: `${displayName} 프로파일링...` } })
            const sectionProfile = await runSmartProfile(sectionId, filePath, section.headerRow, section.dataEndRow)
            if (sectionProfile.qualityScore >= 0) {
              profiles.push(sectionProfile)
            }

            if (quickActions.length === 0) {
              quickActions = generateQuickActions(section.columns)
            }
          }

          if (sections.length > 1) {
            crossSectionData.push({ sections, fileName: file.name })
          }

          fileIndex++
          send({ type: 'status', data: { step: 'parsing', message: `파일 분석 중...`, progress: { current: fileIndex, total: files.length } } })
        }

        // Phase 2: Briefing
        if (results.length > 0) {
          send({ type: 'status', data: { step: 'briefing', message: '데이터 컨텍스트 추론 중...' } })

          const previousFiles = store.listFiles()
          const currentIds = new Set(results.map(f => f.id))
          const previousSummary = previousFiles
            .filter(f => !currentIds.has(f.id))
            .map(f => ({
              name: f.name,
              columns: f.columns,
              sample: f.sample.slice(0, 2),
            }))

          const currentSummary = results.map(f => ({
            name: f.name,
            columns: f.columns.map(c => c.name),
            sample: f.sample,
          }))

          const metaSummary = [...previousSummary, ...currentSummary].slice(0, 10)
          const validProfile = profiles.length > 0 ? profiles[0] : null
          briefing = await inferContext(metaSummary, validProfile)

          if (briefing) {
            send({ type: 'briefing', data: { briefing, partial: false } })
          }
        }

        // Phase 3: Generate charts progressively
        send({ type: 'status', data: { step: 'charts', message: '차트 생성 중...' } })

        const validProfile = profiles.length > 0 ? profiles[0] : null
        let totalExpectedCharts = dashboardInputs.length * 3 // Estimate 3 charts per input
        let chartIndex = 0

        for (const input of dashboardInputs) {
          const charts = await buildLLMDashboard(input, validProfile, briefing ?? null)

          for (const chart of charts) {
            allCharts.push(chart)
            chartIndex++
            // Send each chart as it's created
            send({ type: 'chart', data: { chart, index: chartIndex, total: totalExpectedCharts } })
          }
        }

        // Cross-section charts
        for (const { sections, fileName } of crossSectionData) {
          const crossCharts = buildCrossSectionCharts(sections, fileName)
          for (const chart of crossCharts) {
            allCharts.push(chart)
            chartIndex++
            send({ type: 'chart', data: { chart, index: chartIndex, total: totalExpectedCharts } })
          }
        }

        // Curate final charts
        const curatedCharts = curateDashboard(allCharts, 6)

        // Phase 4: Create session
        let sessionId: string
        const fileIds = results.map(f => f.id)
        const sessionTitle = results.map(f => f.name).join(', ')

        if (existingSessionId) {
          const existing = store.getSession(existingSessionId)
          if (existing) {
            const mergedFileIds = [...existing.fileIds, ...fileIds]
            const mergedCharts = [...(existing.chartsJson ?? []), ...curatedCharts]
            const mergedBriefings = briefing
              ? [briefing, ...(existing.briefingsJson ?? [])]
              : (existing.briefingsJson ?? [])
            store.updateSession(existingSessionId, {
              fileIds: mergedFileIds,
              charts: mergedCharts,
              briefings: mergedBriefings,
              profile: profiles[0] ?? existing.profileJson,
              quickActions,
            })
            sessionId = existingSessionId
          } else {
            const session = store.createSession(sessionTitle, fileIds, {
              charts: curatedCharts,
              briefings: briefing ? [briefing] : [],
              profile: profiles[0] ?? null,
              quickActions,
            })
            sessionId = session.id
          }
        } else {
          const session = store.createSession(sessionTitle, fileIds, {
            charts: curatedCharts,
            briefings: briefing ? [briefing] : [],
            profile: profiles[0] ?? null,
            quickActions,
          })
          sessionId = session.id
        }

        // Send complete event
        send({
          type: 'complete',
          data: {
            sessionId,
            files: results,
            charts: curatedCharts,
            profiles,
            quickActions,
            briefing,
          },
        })
      } catch (error) {
        console.error('[UPLOAD_STREAM]', error)
        send({ type: 'error', data: { message: '파일 업로드에 실패했습니다' } })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

// Legacy non-streaming upload handler
async function handleLegacyUpload(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const existingSessionId = formData.get('sessionId') as string | null

    if (files.length === 0) {
      return NextResponse.json({ error: '파일을 선택해주세요' }, { status: 400 })
    }

    const uploadsDir = path.join(process.cwd(), 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    const store = getSessionStore()
    const results: FileMetadata[] = []
    const allCharts: ScoredChart[] = []
    const profiles: DataProfile[] = []
    let briefing: DataBriefing | undefined
    let quickActions: QuickAction[] = []

    const dashboardInputs: Array<{ fileName: string; columns: ColumnInfo[]; rowCount: number; sample: Record<string, unknown>[] }> = []
    const crossSectionData: Array<{ sections: Awaited<ReturnType<typeof extractAllSections>>; fileName: string }> = []

    for (const file of files) {
      if (!file.name.endsWith('.csv')) continue

      const fileId = uuid()
      const filePath = path.join(uploadsDir, `${fileId}.csv`)
      const buffer = Buffer.from(await file.arrayBuffer())
      await writeFile(filePath, buffer)

      const sections = await extractAllSections(filePath)

      for (const section of sections) {
        const sectionId = uuid()
        const displayName = sections.length > 1 && section.sectionName
          ? `${file.name} — ${section.sectionName}`
          : file.name

        const fileMetadata: FileMetadata = {
          id: sectionId,
          name: displayName,
          path: filePath,
          columns: section.columns,
          rowCount: section.rowCount,
          sample: section.sample.slice(0, 5),
          createdAt: new Date().toISOString(),
        }
        results.push(fileMetadata)

        store.registerFile(
          sectionId,
          displayName,
          filePath,
          section.columns.map(c => c.name),
          section.sample.slice(0, 3),
          section.rowCount,
        )

        dashboardInputs.push({
          fileName: displayName,
          columns: section.columns,
          rowCount: section.rowCount,
          sample: section.sample,
        })

        const sectionProfile = await runSmartProfile(sectionId, filePath, section.headerRow, section.dataEndRow)
        if (sectionProfile.qualityScore >= 0) {
          profiles.push(sectionProfile)
        }

        if (quickActions.length === 0) {
          quickActions = generateQuickActions(section.columns)
        }
      }

      if (sections.length > 1) {
        crossSectionData.push({ sections, fileName: file.name })
      }
    }

    if (results.length > 0) {
      const previousFiles = store.listFiles()
      const currentIds = new Set(results.map(f => f.id))
      const previousSummary = previousFiles
        .filter(f => !currentIds.has(f.id))
        .map(f => ({
          name: f.name,
          columns: f.columns,
          sample: f.sample.slice(0, 2),
        }))

      const currentSummary = results.map(f => ({
        name: f.name,
        columns: f.columns.map(c => c.name),
        sample: f.sample,
      }))

      const metaSummary = [...previousSummary, ...currentSummary].slice(0, 10)
      const validProfile = profiles.length > 0 ? profiles[0] : null
      briefing = await inferContext(metaSummary, validProfile)
    }

    const validProfile = profiles.length > 0 ? profiles[0] : null
    for (const input of dashboardInputs) {
      const charts = await buildLLMDashboard(input, validProfile, briefing ?? null)
      allCharts.push(...charts)
    }

    for (const { sections, fileName } of crossSectionData) {
      const crossCharts = buildCrossSectionCharts(sections, fileName)
      allCharts.push(...crossCharts)
    }

    const curatedCharts = curateDashboard(allCharts, 6)

    let sessionId: string
    const fileIds = results.map(f => f.id)
    const sessionTitle = results.map(f => f.name).join(', ')

    if (existingSessionId) {
      const existing = store.getSession(existingSessionId)
      if (existing) {
        const mergedFileIds = [...existing.fileIds, ...fileIds]
        const mergedCharts = [...(existing.chartsJson ?? []), ...curatedCharts]
        const mergedBriefings = briefing
          ? [briefing, ...(existing.briefingsJson ?? [])]
          : (existing.briefingsJson ?? [])
        store.updateSession(existingSessionId, {
          fileIds: mergedFileIds,
          charts: mergedCharts,
          briefings: mergedBriefings,
          profile: profiles[0] ?? existing.profileJson,
          quickActions,
        })
        sessionId = existingSessionId
      } else {
        const session = store.createSession(sessionTitle, fileIds, {
          charts: curatedCharts,
          briefings: briefing ? [briefing] : [],
          profile: profiles[0] ?? null,
          quickActions,
        })
        sessionId = session.id
      }
    } else {
      const session = store.createSession(sessionTitle, fileIds, {
        charts: curatedCharts,
        briefings: briefing ? [briefing] : [],
        profile: profiles[0] ?? null,
        quickActions,
      })
      sessionId = session.id
    }

    return NextResponse.json({
      data: {
        sessionId,
        files: results,
        charts: curatedCharts,
        profiles,
        quickActions,
        briefing,
      },
    })
  } catch (error) {
    console.error('[UPLOAD]', error)
    return NextResponse.json({ error: '파일 업로드에 실패했습니다' }, { status: 500 })
  }
}
