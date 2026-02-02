"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import type { UploadedFile, ChartData, ChatMessage } from "../page"

interface ChatPanelProps {
  files: UploadedFile[]
  selectedFileIds: string[]
  messages: ChatMessage[]
  onMessagesChange: (messages: ChatMessage[]) => void
  onPinChart: (chart: ChartData) => void
  onClose: () => void
}

export default function ChatPanel({
  selectedFileIds,
  messages,
  onMessagesChange,
  onPinChart,
  onClose,
}: ChatPanelProps) {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMsg: ChatMessage = { role: "user", content: trimmed }
    const updated = [...messages, userMsg]
    onMessagesChange(updated)
    setInput("")
    setIsLoading(true)

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          fileIds: selectedFileIds,
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      const json = await res.json()
      if (json.error) throw new Error(json.error)

      const data = json.data
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.reply,
        charts: data.charts,
        code: data.code,
      }
      onMessagesChange([...updated, assistantMsg])
    } catch {
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: "응답 생성에 실패했습니다. 다시 시도해주세요.",
      }
      onMessagesChange([...updated, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages, selectedFileIds, onMessagesChange])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === "Escape") onClose()
  }

  return (
    <aside
      className="flex w-[400px] flex-col border-l"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-5 py-4"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div>
          <h2 className="text-sm font-semibold tracking-tight">AI Analysis</h2>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {selectedFileIds.length} files selected
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 hover:bg-white/5"
          style={{ color: "var(--text-secondary)" }}
          aria-label="Close chat"
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                Ask anything about your data
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                e.g. &quot;Show me the distribution of ages&quot;
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed"
              style={{
                background: msg.role === "user" ? "var(--bg-tertiary)" : "transparent",
                border: msg.role === "assistant" ? "1px solid var(--border-color)" : "none",
              }}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {msg.code && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs" style={{ color: "var(--text-tertiary)" }}>
                    View code
                  </summary>
                  <pre
                    className="mt-2 overflow-x-auto rounded-lg p-3 text-xs"
                    style={{ background: "var(--bg-primary)", color: "var(--text-secondary)" }}
                  >
                    {msg.code}
                  </pre>
                </details>
              )}

              {msg.charts && msg.charts.length > 0 && (
                <div className="mt-3 space-y-2">
                  {msg.charts.map((chart) => (
                    <div
                      key={chart.id}
                      className="overflow-hidden rounded-lg border"
                      style={{ borderColor: "var(--border-color)" }}
                    >
                      {chart.imageUrl && (
                        <img src={chart.imageUrl} alt={chart.title} className="w-full" />
                      )}
                      <div
                        className="flex items-center justify-between px-3 py-2"
                        style={{ background: "var(--bg-primary)" }}
                      >
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {chart.title}
                        </span>
                        <button
                          onClick={() => onPinChart(chart)}
                          className="rounded px-2 py-0.5 text-xs hover:bg-white/10"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          Pin
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--text-tertiary)" }} />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--text-tertiary)", animationDelay: "0.2s" }} />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--text-tertiary)", animationDelay: "0.4s" }} />
              </div>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Analyzing...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4" style={{ borderColor: "var(--border-color)" }}>
        <div
          className="flex items-end gap-2 rounded-xl border px-4 py-3"
          style={{ background: "var(--bg-input)", borderColor: "var(--border-color)" }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your data..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)", maxHeight: "120px" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="shrink-0 rounded-lg p-2 disabled:opacity-20"
            style={{ background: input.trim() ? "var(--accent)" : "transparent" }}
            aria-label="Send"
          >
            <svg
              width="14" height="14" fill="none"
              stroke={input.trim() ? "#050505" : "var(--text-tertiary)"}
              strokeWidth="2" viewBox="0 0 24 24"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  )
}
