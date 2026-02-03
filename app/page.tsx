"use client"

import { useState, useCallback, useRef } from 'react'
import type { FileMetadata, ChartData, ChatMessage, DataProfile, QuickAction, DataBriefing } from '@/lib/types'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import DataTable from './components/DataTable'
import ResearchPanel from './components/ResearchPanel'
import { useAgentStream, type AgentCompleteResult } from './hooks/useAgentStream'

interface UploadedFile {
  id: string
  name: string
  columns: string[]
  rowCount: number
  sample: Record<string, unknown>[]
}

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [dashboardCharts, setDashboardCharts] = useState<ChartData[]>([])
  const [pinnedCharts, setPinnedCharts] = useState<ChartData[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatOpen, setIsChatOpen] = useState(true)
  const [profile, setProfile] = useState<DataProfile | null>(null)
  const [quickActions, setQuickActions] = useState<QuickAction[]>([])
  const [briefing, setBriefing] = useState<DataBriefing | null>(null)
  const [showDataTable, setShowDataTable] = useState(false)

  const chatInputRef = useRef<string>('')

  const agent = useAgentStream()

  const handleFilesUploaded = useCallback((
    newFiles: FileMetadata[],
    charts: ChartData[],
    newProfile?: DataProfile,
    newQuickActions?: QuickAction[],
    newBriefing?: DataBriefing,
  ) => {
    const mapped: UploadedFile[] = newFiles.map(f => ({
      id: f.id,
      name: f.name,
      columns: f.columns.map(c => c.name),
      rowCount: f.rowCount,
      sample: f.sample,
    }))
    setFiles(prev => [...prev, ...mapped])
    setSelectedFileIds(prev => [...prev, ...newFiles.map(f => f.id)])
    setDashboardCharts(prev => [...prev, ...charts])
    if (newProfile) setProfile(newProfile)
    if (newQuickActions) setQuickActions(newQuickActions)
    if (newBriefing) {
      setBriefing(newBriefing)
      setIsChatOpen(true)
      if (newBriefing.greeting) {
        setChatMessages([{
          role: 'assistant',
          content: newBriefing.greeting,
          followUpQuestions: newBriefing.suggestedQuestions,
        } as ChatMessage])
      }
    }
  }, [])

  const handlePinChart = useCallback((chart: ChartData) => {
    setPinnedCharts(prev => {
      if (prev.some(c => c.id === chart.id)) return prev
      return [...prev, chart]
    })
  }, [])

  const handleUnpinChart = useCallback((chartId: string) => {
    setPinnedCharts(prev => prev.filter(c => c.id !== chartId))
  }, [])

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
      undefined,
      chatMessages.map(m => ({ role: m.role, content: m.content })),
      handleAnalysisComplete,
    )
  }, [agent, selectedFileIds, chatMessages, handleAnalysisComplete])

  // Start agent analysis
  const handleStartAnalysis = useCallback((question: string) => {
    agent.startAnalysis(
      question,
      selectedFileIds,
      undefined,
      chatMessages.map(m => ({ role: m.role, content: m.content })),
      handleAnalysisComplete,
    )
  }, [agent, selectedFileIds, chatMessages, handleAnalysisComplete])

  // Confirm briefing and save context to server
  const handleConfirmBriefing = useCallback(async (confirmed: DataBriefing) => {
    setBriefing(confirmed)
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
          briefing={briefing}
          onConfirmBriefing={handleConfirmBriefing}
          onChartClick={handleChartClick}
        />
      </main>

      {/* Research Panel (replaces ChatPanel) */}
      {isChatOpen && (
        <ResearchPanel
          selectedFileIds={selectedFileIds}
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
