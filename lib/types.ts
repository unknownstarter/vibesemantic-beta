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
  insight?: string
}

// 채팅
export interface ChatMessage {
  id?: string
  sessionId?: string
  role: 'user' | 'assistant'
  content: string
  charts?: ChartData[]
  code?: string
  followUpQuestions?: string[]
  createdAt?: string
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
  profile?: DataProfile
  quickActions?: QuickAction[]
  briefing?: DataBriefing
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

// ========== Smart Profile ==========

export interface DataProfile {
  fileId: string
  qualityScore: number
  totalRows: number
  warnings: ProfileWarning[]
  correlations: CorrelationPair[]
  distributions: DistributionInfo[]
}

export interface ProfileWarning {
  type: 'missing' | 'outlier' | 'type_mismatch' | 'duplicate'
  column: string
  severity: 'high' | 'medium' | 'low'
  detail: string
}

export interface CorrelationPair {
  col1: string
  col2: string
  coefficient: number
  method: 'pearson' | 'spearman'
}

export interface DistributionInfo {
  column: string
  mean: number
  median: number
  std: number
  skew: number
  min: number
  max: number
}

// ========== Quick Actions ==========

export interface QuickAction {
  id: string
  label: string
  description: string
  prompt: string
  icon: string
  columns: string[]
}

// ========== Agent Loop ==========

export interface AnalysisPlan {
  id: string
  goal: string
  steps: AnalysisStep[]
  status: 'planning' | 'executing' | 'complete' | 'failed'
}

export interface AnalysisStep {
  id: string
  order: number
  description: string
  status: 'pending' | 'running' | 'success' | 'failed'
  code?: string
  result?: StepResult
}

export interface StepResult {
  stdout: string
  generatedFiles: string[]
  cachedFiles: string[]
  summary: string
}

export interface AgentResult {
  plan: AnalysisPlan
  insight: string
  citations: Citation[]
  charts: ChartData[]
  followUpQuestions: string[]
}

// ========== Citations ==========

export interface Citation {
  text: string
  rowRange?: [number, number]
  columnName?: string
  value?: string | number
}

// ========== Stateful Context ==========

export interface AnalysisCache {
  id: string
  sessionId: string
  filePath: string
  description: string
  columns: string[]
  rowCount: number
  createdAt: string
}

export interface LearnedContext {
  fileId: string
  columnMeanings: Record<string, string>
  businessContext: string
  knownRelationships: string[]
  previousInsights: string[]
  updatedAt: string
}

// ========== SSE Events ==========

export type AgentEvent =
  | { type: 'plan'; data: AnalysisPlan }
  | { type: 'step_start'; data: { stepId: string; description: string } }
  | { type: 'step_complete'; data: { stepId: string; result: StepResult; charts?: ChartData[] } }
  | { type: 'synthesis'; data: { insight: string; citations: Citation[] } }
  | { type: 'follow_ups'; data: { questions: string[] } }
  | { type: 'error'; data: { message: string } }
  | { type: 'complete'; data: AgentResult }

// ========== Chart Interaction ==========

export interface ChartClickEvent {
  chartId: string
  chartType: string
  clickedValue: string | number
  clickedKey: string
  columnName: string
  suggestedQuestion: string
}

// ========== Export ==========

export type ExportFormat = 'python' | 'notebook'

// ========== Data Briefing (Infer-Then-Confirm) ==========

export interface DataBriefing {
  domain: string
  briefing: string
  columnMeanings: Record<string, string>
  keyMetrics: string[]
  warnings: string[]
  suggestedQuestions: string[]
  greeting: string
  confirmed: boolean
}
