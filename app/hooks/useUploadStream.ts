"use client"

import { useState, useCallback } from 'react'
import type { FileMetadata, ChartData, DataProfile, QuickAction, DataBriefing } from '@/lib/types'
import type { UploadEvent } from '@/app/api/upload/route'

export type UploadStatus = 'idle' | 'uploading' | 'parsing' | 'profiling' | 'briefing' | 'charts' | 'complete' | 'error'

export interface UploadStreamState {
  status: UploadStatus
  message: string
  progress: { current: number; total: number }
  files: FileMetadata[]
  charts: ChartData[]
  profiles: DataProfile[]
  quickActions: QuickAction[]
  briefing: DataBriefing | null
  sessionId: string | null
  error: string | null
}

export interface UploadStreamResult {
  sessionId: string
  files: FileMetadata[]
  charts: ChartData[]
  profiles: DataProfile[]
  quickActions: QuickAction[]
  briefing?: DataBriefing
}

const initialState: UploadStreamState = {
  status: 'idle',
  message: '',
  progress: { current: 0, total: 0 },
  files: [],
  charts: [],
  profiles: [],
  quickActions: [],
  briefing: null,
  sessionId: null,
  error: null,
}

export function useUploadStream() {
  const [state, setState] = useState<UploadStreamState>(initialState)

  const resetState = useCallback(() => {
    setState(initialState)
  }, [])

  const startUpload = useCallback(async (
    files: FileList | File[],
    existingSessionId?: string | null,
    onComplete?: (result: UploadStreamResult) => void,
  ) => {
    setState({
      ...initialState,
      status: 'uploading',
      message: '업로드 준비 중...',
    })

    const formData = new FormData()
    for (const file of Array.from(files)) {
      formData.append('files', file)
    }
    if (existingSessionId) {
      formData.append('sessionId', existingSessionId)
    }

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Accept': 'text/event-stream',
        },
        body: formData,
      })

      if (!response.body) {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: 'No response stream',
        }))
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // Local state for accumulating results
      let localFiles: FileMetadata[] = []
      let localCharts: ChartData[] = []
      let localProfiles: DataProfile[] = []
      let localQuickActions: QuickAction[] = []
      let localBriefing: DataBriefing | null = null
      let localSessionId: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          try {
            const event: UploadEvent = JSON.parse(line.slice(6))

            switch (event.type) {
              case 'status':
                setState(prev => ({
                  ...prev,
                  status: event.data.step as UploadStatus,
                  message: event.data.message,
                  progress: event.data.progress ?? prev.progress,
                }))
                break

              case 'file':
                localFiles = [...localFiles, event.data]
                setState(prev => ({
                  ...prev,
                  files: localFiles,
                }))
                break

              case 'chart':
                localCharts = [...localCharts, event.data.chart]
                setState(prev => ({
                  ...prev,
                  charts: localCharts,
                  progress: { current: event.data.index, total: event.data.total },
                }))
                break

              case 'briefing':
                localBriefing = event.data.briefing
                setState(prev => ({
                  ...prev,
                  briefing: event.data.briefing,
                }))
                break

              case 'complete':
                localSessionId = event.data.sessionId
                localProfiles = event.data.profiles
                localQuickActions = event.data.quickActions
                if (event.data.briefing) {
                  localBriefing = event.data.briefing
                }

                setState(prev => ({
                  ...prev,
                  status: 'complete',
                  message: '완료',
                  sessionId: event.data.sessionId,
                  files: event.data.files,
                  charts: event.data.charts,
                  profiles: event.data.profiles,
                  quickActions: event.data.quickActions,
                  briefing: event.data.briefing ?? null,
                }))

                // Call completion callback
                if (onComplete) {
                  onComplete({
                    sessionId: event.data.sessionId,
                    files: event.data.files,
                    charts: event.data.charts,
                    profiles: event.data.profiles,
                    quickActions: event.data.quickActions,
                    briefing: event.data.briefing,
                  })
                }
                break

              case 'error':
                setState(prev => ({
                  ...prev,
                  status: 'error',
                  error: event.data.message,
                }))
                break
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: String(err),
      }))
    }
  }, [])

  return {
    ...state,
    startUpload,
    resetState,
    isLoading: state.status !== 'idle' && state.status !== 'complete' && state.status !== 'error',
  }
}
