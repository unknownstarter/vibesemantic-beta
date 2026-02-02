import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import type { ExecutionResult } from './types'

const BLOCKED_IMPORTS = [
  'subprocess', 'socket', 'urllib', 'requests', 'http.client',
  'ftplib', 'smtplib', 'telnetlib', 'xmlrpc',
]

const BLOCKED_PATTERNS = [
  /\b__import__\s*\(/,
  /\bcompile\s*\(/,
]

export function validateCode(code: string): { safe: boolean; reason: string } {
  for (const mod of BLOCKED_IMPORTS) {
    if (code.includes(`import ${mod}`) || code.includes(`from ${mod}`)) {
      return { safe: false, reason: `Blocked import: ${mod}` }
    }
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return { safe: false, reason: `Blocked pattern: ${pattern.source}` }
    }
  }

  return { safe: true, reason: '' }
}

export async function executePython(
  code: string,
  cwd: string,
  timeout: number = 30000
): Promise<ExecutionResult> {
  const outputsDir = path.join(process.cwd(), 'outputs')
  await fs.mkdir(outputsDir, { recursive: true })
  let filesBefore: string[] = []
  try {
    filesBefore = await fs.readdir(outputsDir)
  } catch { /* dir may not exist yet */ }

  return new Promise((resolve) => {
    const venvPython = path.join(process.cwd(), '.venv', 'bin', 'python3')
    const proc = spawn(venvPython, ['-c', code], {
      cwd,
      timeout,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        MPLBACKEND: 'Agg',
        VIRTUAL_ENV: path.join(process.cwd(), '.venv'),
        PATH: `${path.join(process.cwd(), '.venv', 'bin')}:${process.env.PATH}`,
      },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', async (exitCode) => {
      let generatedFiles: string[] = []
      try {
        const filesAfter = await fs.readdir(outputsDir)
        generatedFiles = filesAfter.filter(f => !filesBefore.includes(f))
      } catch { /* ignore */ }

      resolve({
        stdout: stdout.slice(0, 1024 * 100),
        stderr: stderr.slice(0, 1024 * 10),
        exitCode: exitCode ?? 1,
        generatedFiles,
      })
    })

    proc.on('error', (err) => {
      resolve({
        stdout: '',
        stderr: err.message,
        exitCode: 1,
        generatedFiles: [],
      })
    })
  })
}
