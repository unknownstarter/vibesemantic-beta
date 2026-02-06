import { NextRequest } from 'next/server'
import path from 'path'
import { runAgentLoop } from '@/lib/agent'
import { getSessionStore } from '@/lib/sessions'
import { buildCacheContext, buildLearnedContextString } from '@/lib/context'
import { compressHistory } from '@/lib/claude'
import { initPythonPool } from '@/lib/executor'
import type { AgentEvent } from '@/lib/types'

// Initialize Python pool on first request
let poolInitialized = false

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json()
  const { question, fileIds, sessionId, history } = body as {
    question: string
    fileIds: string[]
    sessionId?: string
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  }

  if (!question?.trim()) {
    return new Response(JSON.stringify({ error: '질문을 입력해주세요' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        // Initialize Python pool (lazy, once per server lifetime)
        if (!poolInitialized) {
          await initPythonPool()
          poolInitialized = true
        }

        const store = getSessionStore()
        const outputsDir = path.join(process.cwd(), 'outputs')

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
          send({ type: 'error', data: { message: '파일 정보를 찾을 수 없습니다' } })
          controller.close()
          return
        }

        // Build file path context
        const filePathContext = fileIds
          .map(id => {
            const meta = store.getFile(id)
            if (!meta) return null
            return `${meta.name}: ${meta.path}`
          })
          .filter(Boolean)
          .join('\n')

        // 메시지 영속화 — 사용자 질문 저장
        const sid = sessionId ?? 'default'
        if (sessionId) {
          store.addMessage(sessionId, 'user', question)
        }

        // Load caches and context
        const caches = store.listCache(sid)
        const context = fileIds
          .map(id => store.getContext(id))
          .find(c => c !== null) ?? null

        // 대화 이력 압축 (10턴 초과 시)
        const compressedHistory = await compressHistory(history ?? [], sessionId, store)

        const agentResult = await runAgentLoop(
          question,
          metadata,
          caches,
          context,
          compressedHistory,
          filePathContext,
          outputsDir,
          sid,
          store,
          send,
        )

        // 메시지 영속화 — AI 응답 저장
        if (sessionId && agentResult) {
          store.addMessage(
            sessionId,
            'assistant',
            agentResult.insight,
            agentResult.charts.length > 0 ? JSON.stringify(agentResult.charts) : undefined,
          )
        }
      } catch (err) {
        send({ type: 'error', data: { message: String(err) } })
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
