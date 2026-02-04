import { NextRequest, NextResponse } from 'next/server'
import { getSessionStore } from '@/lib/sessions'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileId, domain, businessContext, columnMeanings } = body

    if (!fileId) {
      return NextResponse.json({ error: 'fileId required' }, { status: 400 })
    }

    const store = getSessionStore()
    const domainPrefix = domain ? `[${domain}] ` : ''
    store.saveContext({
      fileId,
      columnMeanings: columnMeanings ?? {},
      businessContext: domainPrefix + (businessContext ?? ''),
      knownRelationships: [],
      previousInsights: [],
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ data: { saved: true } })
  } catch (error) {
    console.error('[CONTEXT]', error)
    return NextResponse.json({ error: '컨텍스트 저장 실패' }, { status: 500 })
  }
}
