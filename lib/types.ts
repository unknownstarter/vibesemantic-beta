// CSV 파일 메타데이터
export interface FileMetadata {
  id: string
  name: string
  path: string
  columns: ColumnInfo[]
  rowCount: number
  sample: Record<string, unknown>[]
  createdAt: string
}

export interface NumericStats {
  min: number
  max: number
  mean: number
  median: number
  std: number
}

export interface ColumnInfo {
  name: string
  type: 'number' | 'string' | 'date' | 'boolean'
  nullCount: number
  uniqueCount: number
  stats?: NumericStats
  topValues?: Array<{ value: string; count: number }>
}

// 차트 데이터
export type ChartType = 'bar' | 'line' | 'pie' | 'histogram' | 'summary'

export interface ChartData {
  id: string
  type: ChartType
  title: string
  data: Record<string, unknown>[]
  xKey?: string
  yKey?: string
  imageUrl?: string
}

// 채팅
export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  charts?: ChartData[]
  code?: string
  createdAt: string
}

// 세션
export interface Session {
  id: string
  title: string
  fileIds: string[]
  createdAt: string
  updatedAt: string
}

// API 응답
export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
}

// 업로드 응답
export interface UploadResult {
  files: FileMetadata[]
  charts: ChartData[]
}

// 채팅 응답
export interface ChatResponse {
  reply: string
  code?: string
  charts?: ChartData[]
  pinnable: boolean
}

// Python 실행 결과
export interface ExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  generatedFiles: string[]
}
