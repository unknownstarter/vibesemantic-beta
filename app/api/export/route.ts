import { NextRequest, NextResponse } from 'next/server'
import { exportAsScript, exportAsNotebook } from '@/lib/export'
import type { ChatMessage, ExportFormat } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messages, sessionTitle, format } = body as {
      messages: ChatMessage[]
      sessionTitle: string
      format: ExportFormat
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: '내보낼 메시지가 없습니다' }, { status: 400 })
    }

    const title = sessionTitle || 'VibeSemantic Analysis'

    if (format === 'notebook') {
      const notebook = exportAsNotebook(messages, title)
      return new NextResponse(JSON.stringify(notebook, null, 2), {
        headers: {
          'Content-Type': 'application/x-ipynb+json',
          'Content-Disposition': `attachment; filename="analysis.ipynb"`,
        },
      })
    }

    // Default: Python script
    const script = exportAsScript(messages, title)
    return new NextResponse(script, {
      headers: {
        'Content-Type': 'text/x-python',
        'Content-Disposition': `attachment; filename="analysis.py"`,
      },
    })
  } catch (error) {
    console.error('[EXPORT]', error)
    return NextResponse.json({ error: '내보내기에 실패했습니다' }, { status: 500 })
  }
}
