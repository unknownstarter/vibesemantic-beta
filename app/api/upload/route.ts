import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { extractAllSections } from '@/lib/metadata'
import { buildAutoDashboard, buildLLMDashboard, buildCrossSectionCharts, generateQuickActions, curateDashboard } from '@/lib/dashboard'
import { runSmartProfile } from '@/lib/profile'
import { inferContext } from '@/lib/briefing'
import { getSessionStore } from '@/lib/sessions'
import type { FileMetadata, DataProfile, QuickAction, DataBriefing } from '@/lib/types'

export async function POST(request: NextRequest) {
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
    const allCharts: ReturnType<typeof buildAutoDashboard> = []
    const profiles: DataProfile[] = []
    let briefing: DataBriefing | undefined
    let quickActions: QuickAction[] = []

    // 섹션별 DashboardInput을 저장해뒀다가 briefing 후 LLM 차트에 활용
    const dashboardInputs: Array<{ fileName: string; columns: import('@/lib/types').ColumnInfo[]; rowCount: number; sample: Record<string, unknown>[] }> = []
    // 교차 섹션 차트용
    const crossSectionData: Array<{ sections: Awaited<ReturnType<typeof extractAllSections>>; fileName: string }> = []

    for (const file of files) {
      if (!file.name.endsWith('.csv')) continue

      const fileId = uuid()
      const filePath = path.join(uploadsDir, `${fileId}.csv`)
      const buffer = Buffer.from(await file.arrayBuffer())
      await writeFile(filePath, buffer)

      // 멀티 섹션 감지: 파일 안의 모든 테이블을 개별 데이터셋으로 추출
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

        // Persist to SQLite for chat API
        store.registerFile(
          sectionId,
          displayName,
          filePath,
          section.columns.map(c => c.name),
          section.sample.slice(0, 3),
          section.rowCount,
        )

        // DashboardInput 저장 (차트 생성은 briefing 후)
        dashboardInputs.push({
          fileName: displayName,
          columns: section.columns,
          rowCount: section.rowCount,
          sample: section.sample,
        })

        // Smart Profile per section — 각 섹션의 데이터 범위만 프로파일링
        const sectionProfile = await runSmartProfile(sectionId, filePath, section.headerRow, section.dataEndRow)
        if (sectionProfile.qualityScore >= 0) {
          profiles.push(sectionProfile)
        }

        // Quick Actions — 첫 섹션에서만 생성 (중복 방지)
        if (quickActions.length === 0) {
          quickActions = generateQuickActions(section.columns)
        }
      }

      // 교차 섹션 데이터 저장
      if (sections.length > 1) {
        crossSectionData.push({ sections, fileName: file.name })
      }
    }

    // Context Inference — 이전 업로드 파일 + 현재 업로드 파일 모두 포함
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

    // LLM 차트 생성 (briefing + profile 확보 후) — 각 섹션별
    const validProfile = profiles.length > 0 ? profiles[0] : null
    for (const input of dashboardInputs) {
      const charts = await buildLLMDashboard(input, validProfile, briefing ?? null)
      allCharts.push(...charts)
    }

    // 교차 섹션 비교 차트
    for (const { sections, fileName } of crossSectionData) {
      const crossCharts = buildCrossSectionCharts(sections, fileName)
      allCharts.push(...crossCharts)
    }

    // 전체 차트에서 핵심 차트 큐레이션
    const curatedCharts = curateDashboard(allCharts, 6)

    // 세션 생성 또는 업데이트
    let sessionId: string
    const fileIds = results.map(f => f.id)
    const sessionTitle = results.map(f => f.name).join(', ')

    if (existingSessionId) {
      // 추가 업로드: 기존 세션 업데이트
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
        // 세션이 사라진 경우 새로 생성
        const session = store.createSession(sessionTitle, fileIds, {
          charts: curatedCharts,
          briefings: briefing ? [briefing] : [],
          profile: profiles[0] ?? null,
          quickActions,
        })
        sessionId = session.id
      }
    } else {
      // 첫 업로드: 새 세션 생성
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
