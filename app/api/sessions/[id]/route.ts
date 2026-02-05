import { NextRequest, NextResponse } from 'next/server'
import { getSessionStore } from '@/lib/sessions'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const store = getSessionStore()
    const session = store.getSession(id)

    if (!session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
    }

    const messages = store.getMessages(id)
    const files = (session.fileIds || [])
      .map(fid => store.getFile(fid))
      .filter(Boolean)

    return NextResponse.json({ data: { ...session, messages, files } })
  } catch (error) {
    console.error('[SESSION_DETAIL]', error)
    return NextResponse.json({ error: '세션 정보를 불러올 수 없습니다' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const store = getSessionStore()
    const session = store.getSession(id)

    if (!session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
    }

    const body = await request.json()
    const updates: Parameters<typeof store.updateSession>[1] = {}

    if (body.title !== undefined) updates.title = body.title
    if (body.fileIds !== undefined) updates.fileIds = body.fileIds
    if (body.charts !== undefined) updates.charts = body.charts
    if (body.pinnedCharts !== undefined) updates.pinnedCharts = body.pinnedCharts
    if (body.briefings !== undefined) updates.briefings = body.briefings
    if (body.profile !== undefined) updates.profile = body.profile
    if (body.quickActions !== undefined) updates.quickActions = body.quickActions

    store.updateSession(id, updates)

    const updated = store.getSession(id)
    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('[SESSION_PATCH]', error)
    return NextResponse.json({ error: '세션 업데이트에 실패했습니다' }, { status: 500 })
  }
}
