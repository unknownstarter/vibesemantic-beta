import type { ChatMessage } from './types'

export function exportAsScript(messages: ChatMessage[], sessionTitle: string): string {
  const lines: string[] = [
    `# ${sessionTitle}`,
    `# VibeSemantic 분석 내보내기`,
    `# 생성일: ${new Date().toISOString()}`,
    '',
    'import pandas as pd',
    'import matplotlib.pyplot as plt',
    'import numpy as np',
    '',
    "plt.rcParams['font.family'] = 'AppleGothic'",
    "plt.rcParams['axes.unicode_minus'] = False",
    '',
  ]

  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push(`# 질문: ${msg.content}`)
      lines.push('')
    } else if (msg.role === 'assistant') {
      if (msg.code) {
        lines.push(`# 응답: ${msg.content.slice(0, 100)}...`)
        lines.push(msg.code)
        lines.push('')
      } else {
        lines.push(`# 인사이트: ${msg.content.slice(0, 200)}`)
        lines.push('')
      }
    }
  }

  return lines.join('\n')
}

interface NotebookCell {
  cell_type: 'code' | 'markdown'
  metadata: Record<string, unknown>
  source: string[]
  outputs?: unknown[]
  execution_count?: number | null
}

interface NotebookJson {
  nbformat: number
  nbformat_minor: number
  metadata: {
    kernelspec: {
      display_name: string
      language: string
      name: string
    }
    language_info: {
      name: string
      version: string
    }
  }
  cells: NotebookCell[]
}

export function exportAsNotebook(messages: ChatMessage[], sessionTitle: string): NotebookJson {
  const cells: NotebookCell[] = []

  // Title cell
  cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: [
      `# ${sessionTitle}\n`,
      '\n',
      `VibeSemantic 분석 내보내기 - ${new Date().toISOString()}\n`,
    ],
  })

  // Setup cell
  cells.push({
    cell_type: 'code',
    metadata: {},
    source: [
      'import pandas as pd\n',
      'import matplotlib.pyplot as plt\n',
      'import numpy as np\n',
      '\n',
      "plt.rcParams['font.family'] = 'AppleGothic'\n",
      "plt.rcParams['axes.unicode_minus'] = False\n",
    ],
    outputs: [],
    execution_count: null,
  })

  for (const msg of messages) {
    if (msg.role === 'user') {
      cells.push({
        cell_type: 'markdown',
        metadata: {},
        source: [`## 질문\n`, '\n', `${msg.content}\n`],
      })
    } else if (msg.role === 'assistant') {
      if (msg.code) {
        cells.push({
          cell_type: 'code',
          metadata: {},
          source: msg.code.split('\n').map((line, i, arr) =>
            i < arr.length - 1 ? line + '\n' : line
          ),
          outputs: [],
          execution_count: null,
        })
      }
      if (msg.content) {
        cells.push({
          cell_type: 'markdown',
          metadata: {},
          source: [`### 분석 결과\n`, '\n', `${msg.content}\n`],
        })
      }
    }
  }

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      language_info: {
        name: 'python',
        version: '3.11.0',
      },
    },
    cells,
  }
}
