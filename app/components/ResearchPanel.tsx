"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import type { ChatMessage, ChartData, AnalysisPlan } from '@/lib/types'
import ImageModal from './ImageModal'
import MarkdownRenderer from './MarkdownRenderer'
import PlanView from './PlanView'
import SuggestionChips from './SuggestionChips'
import ExportButton from './ExportButton'
import ChartCard from './ChartCard'

interface ResearchPanelProps {
  selectedFileIds: string[]
  sessionId?: string | null
  messages: ChatMessage[]
  onMessagesChange: (messages: ChatMessage[]) => void
  onPinChart: (chart: ChartData) => void
  onClose: () => void
  plan: AnalysisPlan | null
  isStreaming: boolean
  insight: string
  followUpQuestions: string[]
  streamCharts: ChartData[]
  onStartAnalysis: (question: string) => void
  elapsedSeconds?: number
  briefingSuggestions?: string[]
}

export default function ResearchPanel({
  selectedFileIds,
  sessionId,
  messages,
  onMessagesChange,
  onPinChart,
  onClose,
  plan,
  isStreaming,
  insight,
  followUpQuestions,
  streamCharts,
  onStartAnalysis,
  elapsedSeconds,
  briefingSuggestions = [],
}: ResearchPanelProps) {
  const [input, setInput] = useState('')
  const [isLegacyLoading, setIsLegacyLoading] = useState(false)
  const [modalImage, setModalImage] = useState<{ src: string; alt: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, plan, insight])

  // Legacy chat (simple single-turn for backward compat)
  const handleLegacySend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isLegacyLoading || isStreaming) return

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const updated = [...messages, userMsg]
    onMessagesChange(updated)
    setInput('')
    setIsLegacyLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          fileIds: selectedFileIds,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          sessionId: sessionId ?? undefined,
        }),
      })

      const json = await res.json()
      if (json.error) throw new Error(json.error)

      const data = json.data
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.reply,
        charts: data.charts,
        code: data.code,
      }
      onMessagesChange([...updated, assistantMsg])
    } catch {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: '응답 생성에 실패했습니다. 다시 시도해주세요.',
      }
      onMessagesChange([...updated, errorMsg])
    } finally {
      setIsLegacyLoading(false)
    }
  }, [input, isLegacyLoading, isStreaming, messages, selectedFileIds, sessionId, onMessagesChange])

  // Agent-based analysis (multi-step)
  const handleAgentSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLegacyLoading || isStreaming) return

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    onMessagesChange([...messages, userMsg])
    setInput('')
    onStartAnalysis(trimmed)
  }, [input, isLegacyLoading, isStreaming, messages, onMessagesChange, onStartAnalysis])

  const handleSend = handleAgentSend

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') onClose()
  }

  const handleSuggestionSelect = (question: string) => {
    if (loading) return
    const userMsg: ChatMessage = { role: 'user', content: question }
    onMessagesChange([...messages, userMsg])
    setInput('')
    onStartAnalysis(question)
  }

  const handleChartClick = useCallback((event: { suggestedQuestion: string }) => {
    if (isLegacyLoading || isStreaming) return
    const userMsg: ChatMessage = { role: 'user', content: event.suggestedQuestion }
    onMessagesChange([...messages, userMsg])
    onStartAnalysis(event.suggestedQuestion)
  }, [isLegacyLoading, isStreaming, messages, onMessagesChange, onStartAnalysis])

  const loading = isLegacyLoading || isStreaming

  return (
    <aside
      className="flex w-[520px] flex-col border-l"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-5 py-4"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Research</h2>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {selectedFileIds.length} files selected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton messages={messages} />
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Close"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Empty state — 브리핑 추천 질문이 있으면 프로액티브 메시지 */}
        {messages.length === 0 && !plan && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center px-4">
              {briefingSuggestions.length > 0 ? (
                <>
                  <div className="mb-3 text-2xl">👋</div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    데이터를 분석했어요!
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    아래 추천 질문을 클릭하거나 직접 질문해보세요
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    데이터에 대해 무엇이든 질문하세요
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    AI가 다단계 분석 계획을 세우고 실행합니다
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed"
              style={{
                background: msg.role === 'user' ? 'var(--bg-tertiary)' : 'transparent',
                border: msg.role === 'assistant' ? '1px solid var(--border-color)' : 'none',
              }}
            >
              {msg.role === 'assistant' ? (
                <MarkdownRenderer content={msg.content} />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}

              {msg.code && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    View code
                  </summary>
                  <pre
                    className="mt-2 overflow-x-auto rounded-lg p-3 text-xs"
                    style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                  >
                    {msg.code}
                  </pre>
                </details>
              )}

              {msg.charts && msg.charts.length > 0 && (
                <div className="mt-3 space-y-2">
                  {msg.charts.map((chart) => (
                    chart.data && chart.data.length > 0 ? (
                      <ChartCard
                        key={chart.id}
                        chart={chart}
                        onPin={() => onPinChart(chart)}
                        onChartClick={handleChartClick}
                      />
                    ) : (
                      <div
                        key={chart.id}
                        className="overflow-hidden rounded-lg border"
                        style={{ borderColor: 'var(--border-color)' }}
                      >
                        {chart.imageUrl && (
                          <img
                            src={chart.imageUrl}
                            alt={chart.title}
                            className="w-full cursor-pointer"
                            onClick={() => setModalImage({ src: chart.imageUrl!, alt: chart.title })}
                          />
                        )}
                        <div
                          className="flex items-center justify-between px-3 py-2"
                          style={{ background: 'var(--bg-primary)' }}
                        >
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {chart.title}
                          </span>
                          <button
                            onClick={() => onPinChart(chart)}
                            className="rounded px-2 py-0.5 text-xs hover:bg-white/10"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            Pin
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Plan View */}
        {plan && <PlanView plan={plan} elapsedSeconds={elapsedSeconds} />}

        {/* Stream charts */}
        {streamCharts.length > 0 && (
          <div className="space-y-2">
            {streamCharts.map(chart => (
              chart.data && chart.data.length > 0 ? (
                <ChartCard
                  key={chart.id}
                  chart={chart}
                  onPin={() => onPinChart(chart)}
                />
              ) : (
                <div
                  key={chart.id}
                  className="overflow-hidden rounded-lg border"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  {chart.imageUrl && (
                    <img
                      src={chart.imageUrl}
                      alt={chart.title}
                      className="w-full cursor-pointer"
                      onClick={() => setModalImage({ src: chart.imageUrl!, alt: chart.title })}
                    />
                  )}
                  <div
                    className="flex items-center justify-between px-3 py-2"
                    style={{ background: 'var(--bg-primary)' }}
                  >
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {chart.title}
                    </span>
                    <button
                      onClick={() => onPinChart(chart)}
                      className="rounded px-2 py-0.5 text-xs hover:bg-white/10"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Pin
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}

        {/* Insight from synthesis */}
        {insight && (
          <div
            className="rounded-xl border px-4 py-3 text-sm leading-relaxed"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <MarkdownRenderer content={insight} />
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--text-tertiary)' }} />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--text-tertiary)', animationDelay: '0.2s' }} />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--text-tertiary)', animationDelay: '0.4s' }} />
              </div>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {isStreaming
                  ? plan
                    ? `${plan.steps.filter(s => s.status === 'success').length}/${plan.steps.length}단계 실행 중...`
                    : '분석 계획 수립 중...'
                  : 'Analyzing...'}
                {elapsedSeconds != null && elapsedSeconds > 0 && (
                  <span className="ml-1">{elapsedSeconds}초</span>
                )}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips — 스트리밍 중 > 메시지 내 > 브리핑 폴백 순서 */}
      {(() => {
        const liveFollowUps = isStreaming ? followUpQuestions : []
        const lastAssistant = !isStreaming
          ? [...messages].reverse().find(m => m.role === 'assistant' && m.followUpQuestions && m.followUpQuestions.length > 0)
          : null
        // 우선순위: 스트리밍 > 메시지 내 followUpQuestions > 브리핑 suggestedQuestions
        const activeFollowUps = liveFollowUps.length > 0
          ? liveFollowUps
          : lastAssistant?.followUpQuestions ?? briefingSuggestions
        return activeFollowUps.length > 0 && !loading ? (
          <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border-color)' }}>
            <p className="mb-2 text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
              💡 이런 질문을 해보세요
            </p>
            <SuggestionChips questions={activeFollowUps} onSelect={handleSuggestionSelect} />
          </div>
        ) : null
      })()}

      {/* Input */}
      <div className="border-t p-4" style={{ borderColor: 'var(--border-color)' }}>
        <div
          className="flex items-end gap-2 rounded-xl border px-4 py-3"
          style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)' }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="데이터에 대해 질문하세요..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)', maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="shrink-0 rounded-lg p-2 disabled:opacity-20"
            style={{ background: input.trim() ? 'var(--accent)' : 'transparent' }}
            aria-label="Send"
          >
            <svg
              width="14" height="14" fill="none"
              stroke={input.trim() ? '#050505' : 'var(--text-tertiary)'}
              strokeWidth="2" viewBox="0 0 24 24"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      <ImageModal
        src={modalImage?.src ?? ''}
        alt={modalImage?.alt ?? ''}
        open={modalImage !== null}
        onClose={() => setModalImage(null)}
      />
    </aside>
  )
}
