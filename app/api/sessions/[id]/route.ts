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
    return NextResponse.json({ data: { ...session, messages } })
  } catch (error) {
    console.error('[SESSION_DETAIL]', error)
    return NextResponse.json({ error: '세션 정보를 불러올 수 없습니다' }, { status: 500 })
  }
}
