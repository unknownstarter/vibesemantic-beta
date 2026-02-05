"use client"

import { useState, useCallback, useRef, useEffect } from 'react'
import type { FileMetadata, UploadedFile, ChartData, ChatMessage, DataProfile, QuickAction, DataBriefing } from '@/lib/types'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import DataTable from './components/DataTable'
import ResearchPanel from './components/ResearchPanel'
import { useAgentStream, type AgentCompleteResult } from './hooks/useAgentStream'

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [dashboardCharts, setDashboardCharts] = useState<ChartData[]>([])
  const [pinnedCharts, setPinnedCharts] = useState<ChartData[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatOpen, setIsChatOpen] = useState(true)
  const [profile, setProfile] = useState<DataProfile | null>(null)
  const [quickActions, setQuickActions] = useState<QuickAction[]>([])
  const [briefings, setBriefings] = useState<DataBriefing[]>([])
  const [showDataTable, setShowDataTable] = useState(false)
  const [, setIsRestoring] = useState(true)

  const chatInputRef = useRef<string>('')

  const agent = useAgentStream()

  // 페이지 로드 시 마지막 세션 복원
  useEffect(() => {
    async function restoreLastSession() {
      try {
        const res = await fetch('/api/sessions')
        if (!res.ok) return
        const { data: sessions } = await res.json()
        if (!sessions || sessions.length === 0) return

        const lastSession = sessions[0] // 최신순 정렬
        const detailRes = await fetch(`/api/sessions/${lastSession.id}`)
        if (!detailRes.ok) return
        const { data } = await detailRes.json()

        setSessionId(data.id)

        // 파일 복원
        if (data.files && data.files.length > 0) {
          const restored: UploadedFile[] = data.files.map((f: { id: string; name: string; columns: string[]; sample: Record<string, unknown>[]; rowCount?: number }) => ({
            id: f.id,
            name: f.name,
            columns: f.columns,
            rowCount: f.rowCount || 0,
            sample: f.sample || [],
          }))
          setFiles(restored)
          setSelectedFileIds(restored.map(f => f.id))
        }

        // 차트 복원
        if (data.chartsJson && data.chartsJson.length > 0) {
          setDashboardCharts(data.chartsJson)
        }

        // 핀 차트 복원
        if (data.pinnedChartsJson && data.pinnedChartsJson.length > 0) {
          setPinnedCharts(data.pinnedChartsJson)
        }

        // 브리핑 복원
        if (data.briefingsJson && data.briefingsJson.length > 0) {
          setBriefings(data.briefingsJson)
        }

        // 프로필 복원
        if (data.profileJson) {
          setProfile(data.profileJson)
        }

        // 퀵 액션 복원
        if (data.quickActionsJson && data.quickActionsJson.length > 0) {
          setQuickActions(data.quickActionsJson)
        }

        // 채팅 메시지 복원
        if (data.messages && data.messages.length > 0) {
          const restored: ChatMessage[] = data.messages.map((m: { role: 'user' | 'assistant'; content: string; charts_json?: string; code?: string }) => ({
            role: m.role,
            content: m.content,
            charts: m.charts_json ? JSON.parse(m.charts_json) : undefined,
            code: m.code || undefined,
          }))
          setChatMessages(restored)
        } else if (data.briefingsJson && data.briefingsJson.length > 0) {
          // 메시지가 없지만 briefing greeting이 있으면 복원
          const greetings: ChatMessage[] = data.briefingsJson
            .filter((b: DataBriefing) => b.greeting)
            .map((b: DataBriefing) => ({
              role: 'assistant' as const,
              content: b.greeting,
              followUpQuestions: b.suggestedQuestions,
            }))
          if (greetings.length > 0) setChatMessages(greetings)
        }
      } catch (err) {
        console.error('[SESSION_RESTORE]', err)
      } finally {
        setIsRestoring(false)
      }
    }
    restoreLastSession()
  }, [])

  const handleFilesUploaded = useCallback((
    newSessionId: string,
    newFiles: FileMetadata[],
    charts: ChartData[],
    newProfile?: DataProfile,
    newQuickActions?: QuickAction[],
    newBriefing?: DataBriefing,
  ) => {
    setSessionId(newSessionId)
    const mapped: UploadedFile[] = newFiles.map(f => ({
      id: f.id,
      name: f.name,
      columns: f.columns.map(c => c.name),
      rowCount: f.rowCount,
      sample: f.sample,
    }))
    setFiles(prev => [...prev, ...mapped])
    setSelectedFileIds(prev => [...prev, ...newFiles.map(f => f.id)])

    // 차트: 같은 소스의 기존 차트만 교체, 다른 소스 차트는 유지
    setDashboardCharts(prev => {
      const newSources = new Set(charts.map(c => c.source).filter(Boolean))
      // 새 업로드와 같은 소스를 가진 기존 차트 제거, 나머지 보존
      const kept = prev.filter(c => !c.source || !newSources.has(c.source))
      return [...kept, ...charts]
    })

    if (newProfile) setProfile(newProfile)

    // 퀵 액션: 병합 후 중복 제거 (최대 5개)
    if (newQuickActions && newQuickActions.length > 0) {
      setQuickActions(prev => {
        const merged = [...newQuickActions, ...prev]
        const seen = new Set<string>()
        return merged.filter(a => {
          if (seen.has(a.label)) return false
          seen.add(a.label)
          return true
        }).slice(0, 5)
      })
    }

    if (newBriefing) {
      // 브리핑 누적: 기존 브리핑 유지 + 새 브리핑 추가
      setBriefings(prev => [...prev, newBriefing])
      setIsChatOpen(true)
      if (newBriefing.greeting) {
        setChatMessages(prev => {
          const greetingMsg: ChatMessage = {
            role: 'assistant',
            content: newBriefing.greeting,
            followUpQuestions: newBriefing.suggestedQuestions,
          }
          if (prev.length === 0) return [greetingMsg]
          return [...prev, greetingMsg]
        })
      }
    }
  }, [])

  const handlePinChart = useCallback((chart: ChartData) => {
    setPinnedCharts(prev => {
      if (prev.some(c => c.id === chart.id)) return prev
      const updated = [...prev, chart]
      if (sessionId) {
        fetch(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinnedCharts: updated }),
        }).catch(err => console.error('[PIN_SAVE]', err))
      }
      return updated
    })
  }, [sessionId])

  const handleUnpinChart = useCallback((chartId: string) => {
    setPinnedCharts(prev => {
      const updated = prev.filter(c => c.id !== chartId)
      if (sessionId) {
        fetch(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinnedCharts: updated }),
        }).catch(err => console.error('[UNPIN_SAVE]', err))
      }
      return updated
    })
  }, [sessionId])

  const handleToggleFile = useCallback((fileId: string) => {
    setSelectedFileIds(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    )
  }, [])

  // Chart → Chat Bridge
  const handleChartClick = useCallback((event: { suggestedQuestion: string }) => {
    chatInputRef.current = event.suggestedQuestion
    setIsChatOpen(true)
    // ResearchPanel will read this and set its input
  }, [])

  // 분석 완료 시 chatMessages에 assistant 메시지 영속화
  const handleAnalysisComplete = useCallback((result: AgentCompleteResult) => {
    if (!result.insight && result.charts.length === 0) return
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: result.insight,
      charts: result.charts.length > 0 ? result.charts : undefined,
      followUpQuestions: result.followUpQuestions.length > 0 ? result.followUpQuestions : undefined,
    }
    setChatMessages(prev => [...prev, assistantMsg])
  }, [])

  // Quick Action → Agent Analysis
  const handleQuickAction = useCallback((prompt: string) => {
    setIsChatOpen(true)
    const userMsg: ChatMessage = { role: 'user', content: prompt }
    setChatMessages(prev => [...prev, userMsg])
    agent.startAnalysis(
      prompt,
      selectedFileIds,
      sessionId ?? undefined,
      chatMessages.map(m => ({ role: m.role, content: m.content })),
      handleAnalysisComplete,
    )
  }, [agent, selectedFileIds, sessionId, chatMessages, handleAnalysisComplete])

  // Start agent analysis
  const handleStartAnalysis = useCallback((question: string) => {
    agent.startAnalysis(
      question,
      selectedFileIds,
      sessionId ?? undefined,
      chatMessages.map(m => ({ role: m.role, content: m.content })),
      handleAnalysisComplete,
    )
  }, [agent, selectedFileIds, sessionId, chatMessages, handleAnalysisComplete])

  // Confirm briefing and save context to server
  const handleConfirmBriefing = useCallback(async (confirmed: DataBriefing) => {
    setBriefings(prev => prev.map(b => b.domain === confirmed.domain ? confirmed : b))
    const fileId = selectedFileIds[0]
    if (fileId) {
      try {
        await fetch('/api/context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId,
            domain: confirmed.domain,
            businessContext: confirmed.briefing,
            columnMeanings: confirmed.columnMeanings,
          }),
        })
      } catch (err) {
        console.error('[CONTEXT SAVE]', err)
      }
    }
  }, [selectedFileIds])

  // Get sample data for DataTable
  const sampleData = files.length > 0 ? files[files.length - 1].sample : undefined
  const sampleColumns = files.length > 0 ? files[files.length - 1].columns : undefined

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        files={files}
        selectedFileIds={selectedFileIds}
        sessionId={sessionId}
        onToggleFile={handleToggleFile}
        onFilesUploaded={handleFilesUploaded}
        quickActions={quickActions}
        onQuickAction={handleQuickAction}
        onToggleDataTable={() => setShowDataTable(prev => !prev)}
        showDataTable={showDataTable}
      />

      {/* Main Dashboard */}
      <main className="flex-1 overflow-y-auto p-6">
        {showDataTable && sampleData && sampleColumns && (
          <div className="mb-4">
            <DataTable data={sampleData} columns={sampleColumns} />
          </div>
        )}
        <Dashboard
          charts={dashboardCharts}
          pinnedCharts={pinnedCharts}
          onUnpinChart={handleUnpinChart}
          profile={profile}
          briefings={briefings}
          onConfirmBriefing={handleConfirmBriefing}
          onChartClick={handleChartClick}
        />
      </main>

      {/* Research Panel (replaces ChatPanel) */}
      {isChatOpen && (
        <ResearchPanel
          selectedFileIds={selectedFileIds}
          sessionId={sessionId}
          messages={chatMessages}
          onMessagesChange={setChatMessages}
          onPinChart={handlePinChart}
          onClose={() => setIsChatOpen(false)}
          plan={agent.plan}
          isStreaming={agent.isStreaming}
          insight={agent.insight}
          followUpQuestions={agent.followUpQuestions}
          streamCharts={agent.streamCharts}
          onStartAnalysis={handleStartAnalysis}
          elapsedSeconds={agent.elapsedSeconds}
        />
      )}

      {/* Chat Toggle Button */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed right-4 bottom-4 rounded-full p-4"
          style={{ background: 'var(--accent)' }}
        >
          <svg
            width="24" height="24" fill="none"
            stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}
    </div>
  )
}
