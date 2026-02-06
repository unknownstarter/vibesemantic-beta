import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import type { ExecutionResult } from './types'
import { executeWithWorker, warmPool, isPoolInitialized } from './python-pool'

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

  // Try pool execution first
  if (isPoolInitialized()) {
    const poolStart = Date.now()
    const poolResult = await executeWithWorker(code, timeout)

    // Check if pool execution succeeded (not fallback)
    if (poolResult.stderr !== '__POOL_FALLBACK__') {
      console.log(`[POOL] Executed in ${Date.now() - poolStart}ms (exit: ${poolResult.exitCode})`)
      let generatedFiles: string[] = []
      try {
        const filesAfter = await fs.readdir(outputsDir)
        generatedFiles = filesAfter.filter(f => !filesBefore.includes(f))
      } catch { /* ignore */ }

      return {
        stdout: poolResult.stdout.slice(0, 1024 * 100),
        stderr: poolResult.stderr.slice(0, 1024 * 10),
        exitCode: poolResult.exitCode,
        generatedFiles,
      }
    }
    // Pool unavailable or failed - fall through to spawn
    console.log('[POOL] Fallback to spawn (pool unavailable)')
  }

  // Fallback: spawn new process (also used when pool not initialized)
  console.log('[EXECUTOR] Using spawn (pool not initialized or fallback)')
  return new Promise((resolve) => {
    // Python 경로: PYTHON_PATH 환경 변수 > .venv/bin/python3 > python3
    const venvDir = [process.cwd(), '.venv'].join(path.sep)
    const venvBin = [venvDir, 'bin'].join(path.sep)
    const pythonPath = process.env.PYTHON_PATH || [venvBin, 'python3'].join(path.sep)
    const proc = spawn(pythonPath, ['-c', code], {
      cwd,
      timeout,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        MPLBACKEND: 'Agg',
        VIRTUAL_ENV: venvDir,
        PATH: `${venvBin}:${process.env.PATH}`,
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

/**
 * Initialize Python worker pool at server startup
 * Call this from app initialization or API route
 */
export async function initPythonPool(): Promise<void> {
  if (!isPoolInitialized()) {
    await warmPool(2)
  }
}
