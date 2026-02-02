import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { generateCode, interpretResult } from '@/lib/claude'
import { executePython, validateCode } from '@/lib/executor'
import { getSessionStore } from '@/lib/sessions'
import type { ChatResponse, ChartData } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, fileIds, history } = body as {
      message: string
      fileIds: string[]
      history: Array<{ role: 'user' | 'assistant'; content: string }>
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: '메시지를 입력해주세요' }, { status: 400 })
    }

    const outputsDir = path.join(process.cwd(), 'outputs')
    const uploadsDir = path.join(process.cwd(), 'uploads')
    const store = getSessionStore()

    // Build metadata context from SQLite
    const metadata = fileIds
      .map(id => store.getFile(id))
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .map(m => ({
        name: m.name,
        columns: m.columns,
        sample: m.sample.slice(0, 3),
      }))

    if (metadata.length === 0 && fileIds.length > 0) {
      return NextResponse.json({
        data: {
          reply: '분석할 파일 정보를 찾을 수 없습니다. 파일을 다시 업로드해주세요.',
          pinnable: false,
        } satisfies ChatResponse,
      })
    }

    // Build file path context for code generation
    const filePathContext = fileIds
      .map(id => {
        const meta = store.getFile(id)
        if (!meta) return null
        return `${meta.name}: ${meta.path}`
      })
      .filter(Boolean)
      .join('\n')

    const codePrompt = `${message}\n\n파일 경로:\n${filePathContext}\n\n차트 생성 시 저장 경로: ${outputsDir}/${uuid()}.png`

    // Generate code
    let code = await generateCode(metadata, history || [], codePrompt)
    const validation = validateCode(code)

    if (!validation.safe) {
      return NextResponse.json({
        data: {
          reply: '보안 검증에 실패했습니다. 다른 방식으로 질문해주세요.',
          code,
          pinnable: false,
        } satisfies ChatResponse,
      })
    }

    // Execute with retry
    let execResult = await executePython(code, uploadsDir, 30000)
    let retries = 0

    while (execResult.exitCode !== 0 && retries < 2) {
      retries++
      const retryPrompt = `이전 코드 실행이 실패했어. 에러를 수정해줘.\n\n이전 코드:\n\`\`\`python\n${code}\n\`\`\`\n\n에러:\n${execResult.stderr}\n\n파일 경로:\n${filePathContext}`
      code = await generateCode(metadata, history || [], retryPrompt)
      const fixValidation = validateCode(code)
      if (!fixValidation.safe) break
      execResult = await executePython(code, uploadsDir, 30000)
    }

    // Build charts from generated files
    const charts: ChartData[] = execResult.generatedFiles
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
      .map(f => ({
        id: uuid(),
        type: 'bar' as const,
        title: '분석 차트',
        data: [],
        imageUrl: `/api/outputs/${f}`,
      }))

    // Interpret results
    const outputText = execResult.exitCode === 0
      ? execResult.stdout || '(출력 없음)'
      : `실행 실패:\n${execResult.stderr}`

    const reply = await interpretResult(outputText, message)

    const response: ChatResponse = {
      reply,
      code,
      charts: charts.length > 0 ? charts : undefined,
      pinnable: charts.length > 0,
    }

    return NextResponse.json({ data: response })
  } catch (error) {
    console.error('[CHAT]', error)
    return NextResponse.json({ error: 'AI 응답 생성에 실패했습니다' }, { status: 500 })
  }
}
