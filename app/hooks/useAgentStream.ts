"use client"

import { useState, useCallback } from 'react'
import type { AnalysisPlan, ChartData, Citation, AgentEvent } from '@/lib/types'

interface AgentStreamState {
  plan: AnalysisPlan | null
  isStreaming: boolean
  insight: string
  citations: Citation[]
  followUpQuestions: string[]
  streamCharts: ChartData[]
  error: string | null
}

export interface AgentCompleteResult {
  insight: string
  charts: ChartData[]
  followUpQuestions: string[]
}

export function useAgentStream() {
  const [state, setState] = useState<AgentStreamState>({
    plan: null,
    isStreaming: false,
    insight: '',
    citations: [],
    followUpQuestions: [],
    streamCharts: [],
    error: null,
  })

  const startAnalysis = useCallback(async (
    question: string,
    fileIds: string[],
    sessionId?: string,
    history?: Array<{ role: string; content: string }>,
    onComplete?: (result: AgentCompleteResult) => void,
  ) => {
    setState(prev => ({
      ...prev,
      isStreaming: true,
      plan: null,
      insight: '',
      citations: [],
      followUpQuestions: [],
      streamCharts: [],
      error: null,
    }))

    // 로컬 변수로 결과 누적 (state와 별도로)
    let localInsight = ''
    let localCharts: ChartData[] = []
    let localFollowUps: string[] = []

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, fileIds, sessionId, history }),
      })

      if (!response.body) {
        setState(prev => ({ ...prev, isStreaming: false, error: 'No response stream' }))
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event: AgentEvent = JSON.parse(line.slice(6))

            switch (event.type) {
              case 'plan':
                setState(prev => ({ ...prev, plan: event.data }))
                break
              case 'step_start':
                setState(prev => {
                  if (!prev.plan) return prev
                  const steps = prev.plan.steps.map(s =>
                    s.id === event.data.stepId ? { ...s, status: 'running' as const } : s
                  )
                  return { ...prev, plan: { ...prev.plan, steps } }
                })
                break
              case 'step_complete': {
                const newCharts = event.data.charts ?? []
                localCharts = [...localCharts, ...newCharts]
                setState(prev => {
                  if (!prev.plan) return prev
                  const steps = prev.plan.steps.map(s =>
                    s.id === event.data.stepId ? { ...s, status: 'success' as const, result: event.data.result } : s
                  )
                  return {
                    ...prev,
                    plan: { ...prev.plan, steps },
                    streamCharts: [...prev.streamCharts, ...newCharts],
                  }
                })
                break
              }
              case 'synthesis':
                localInsight = event.data.insight
                setState(prev => ({
                  ...prev,
                  insight: event.data.insight,
                  citations: event.data.citations,
                }))
                break
              case 'follow_ups':
                localFollowUps = event.data.questions
                setState(prev => ({
                  ...prev,
                  followUpQuestions: event.data.questions,
                }))
                break
              case 'error':
                setState(prev => ({ ...prev, error: event.data.message }))
                break
              case 'complete':
                // onComplete 콜백으로 결과 전달 → page.tsx에서 chatMessages에 영속화
                if (onComplete) {
                  onComplete({
                    insight: localInsight || event.data.insight,
                    charts: localCharts.length > 0 ? localCharts : event.data.charts,
                    followUpQuestions: localFollowUps.length > 0 ? localFollowUps : event.data.followUpQuestions,
                  })
                }
                // 스트리밍 state 초기화 (chatMessages에 영속화되었으므로 중복 표시 방지)
                setState(prev => ({
                  ...prev,
                  isStreaming: false,
                  plan: null,
                  insight: '',
                  citations: [],
                  followUpQuestions: [],
                  streamCharts: [],
                }))
                return // complete 후 루프 종료
            }
          } catch { /* skip malformed events */ }
        }
      }
    } catch (err) {
      setState(prev => ({ ...prev, error: String(err) }))
    }

    // complete 이벤트 없이 스트림 종료된 경우에도 콜백 호출
    setState(prev => {
      if (prev.isStreaming && onComplete && (localInsight || localCharts.length > 0)) {
        onComplete({
          insight: localInsight,
          charts: localCharts,
          followUpQuestions: localFollowUps,
        })
        return {
          ...prev,
          isStreaming: false,
          plan: null,
          insight: '',
          citations: [],
          followUpQuestions: [],
          streamCharts: [],
        }
      }
      return { ...prev, isStreaming: false }
    })
  }, [])

  return { ...state, startAnalysis }
}
