import { NextResponse } from 'next/server'
import { getSessionStore } from '@/lib/sessions'

export async function GET() {
  try {
    const store = getSessionStore()
    const sessions = store.listSessions()
    return NextResponse.json({ data: sessions })
  } catch (error) {
    console.error('[SESSIONS]', error)
    return NextResponse.json({ error: '세션 목록을 불러올 수 없습니다' }, { status: 500 })
  }
}
