/**
 * Python Warmer Pool
 *
 * 미리 워밍된 Python 프로세스 풀을 유지하여 연속 실행 시 90% 시간 단축
 * - 첫 실행: worker.py 시작 + pandas import (~2-3초)
 * - 이후 실행: 즉시 응답 (~50ms)
 */
import { spawn, ChildProcess } from 'child_process'
import path from 'path'

interface PythonWorker {
  proc: ChildProcess
  busy: boolean
  lastUsed: number
  id: number
}

interface ExecuteResult {
  stdout: string
  stderr: string
  exitCode: number
}

// Pool configuration
const POOL_SIZE = 2
const WORKER_IDLE_TIMEOUT = 30000 // 30초 미사용 시 재활용
const EXECUTION_TIMEOUT = 30000 // 기본 실행 타임아웃

let workers: PythonWorker[] = []
let workerIdCounter = 0
let initialized = false
let cleanupInterval: ReturnType<typeof setInterval> | null = null

/**
 * Python 경로 결정 (런타임에만 실행)
 * PYTHON_PATH 환경변수 > python3 (시스템)
 * .venv 경로는 lib/executor.ts에서 처리하므로 여기서는 사용하지 않음
 */
function getPythonPath(): string {
  return process.env.PYTHON_PATH || 'python3'
}

/**
 * Worker 프로세스 생성
 */
function createWorker(): Promise<PythonWorker> {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath()
    const cwd = process.cwd()
    const workerScript = [cwd, 'scripts', 'worker.py'].join(path.sep)

    // Build env at runtime to avoid Turbopack scanning .venv
    const venvDir = [cwd, '.venv'].join(path.sep)
    const venvBin = [venvDir, 'bin'].join(path.sep)

    const proc = spawn(pythonPath, [workerScript], {
      cwd,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        MPLBACKEND: 'Agg',
        VIRTUAL_ENV: venvDir,
        PATH: `${venvBin}:${process.env.PATH}`,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const worker: PythonWorker = {
      proc,
      busy: false,
      lastUsed: Date.now(),
      id: ++workerIdCounter,
    }

    let readyReceived = false
    const timeoutId = setTimeout(() => {
      if (!readyReceived) {
        proc.kill()
        reject(new Error('Worker startup timeout'))
      }
    }, 10000)

    // Wait for WORKER_READY signal
    const onData = (data: Buffer) => {
      const text = data.toString()
      if (text.includes('WORKER_READY') && !readyReceived) {
        readyReceived = true
        clearTimeout(timeoutId)
        proc.stdout?.off('data', onData)
        resolve(worker)
      }
    }

    proc.stdout?.on('data', onData)

    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      reject(err)
    })

    proc.on('exit', () => {
      // Remove from pool when process exits
      workers = workers.filter(w => w.id !== worker.id)
    })
  })
}

/**
 * 풀 초기화 - 워커 미리 생성
 */
export async function warmPool(count: number = POOL_SIZE): Promise<void> {
  if (initialized) return

  const promises: Promise<PythonWorker>[] = []
  for (let i = 0; i < count; i++) {
    promises.push(
      createWorker().catch(err => {
        console.error('[PythonPool] Failed to create worker:', err.message)
        return null as unknown as PythonWorker
      })
    )
  }

  const results = await Promise.all(promises)
  workers = results.filter(w => w !== null)
  initialized = true

  // Start cleanup interval
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupIdleWorkers, 10000)
  }

  console.log(`[PythonPool] Warmed ${workers.length} workers`)
}

/**
 * 오래 미사용된 워커 정리 및 재활용
 */
function cleanupIdleWorkers(): void {
  const now = Date.now()
  for (const worker of workers) {
    if (!worker.busy && now - worker.lastUsed > WORKER_IDLE_TIMEOUT) {
      // Kill and remove idle worker
      worker.proc.kill()
      workers = workers.filter(w => w.id !== worker.id)

      // Create replacement worker
      createWorker()
        .then(newWorker => {
          workers.push(newWorker)
        })
        .catch(err => {
          console.error('[PythonPool] Failed to replace worker:', err.message)
        })
    }
  }
}

/**
 * 가용 워커 획득
 */
function acquireWorker(): PythonWorker | null {
  const available = workers.find(w => !w.busy)
  if (available) {
    available.busy = true
    available.lastUsed = Date.now()
    return available
  }
  return null
}

/**
 * 워커 반환
 */
function releaseWorker(worker: PythonWorker): void {
  worker.busy = false
  worker.lastUsed = Date.now()
}

/**
 * 워커로 코드 실행
 */
export function executeWithWorker(
  code: string,
  timeout: number = EXECUTION_TIMEOUT
): Promise<ExecuteResult> {
  return new Promise((resolve) => {
    const worker = acquireWorker()

    if (!worker) {
      // No available worker - resolve with fallback indicator
      resolve({
        stdout: '',
        stderr: '__POOL_FALLBACK__',
        exitCode: -1,
      })
      return
    }

    let buffer = ''
    let resultReceived = false

    const timeoutId = setTimeout(() => {
      if (!resultReceived) {
        resultReceived = true
        releaseWorker(worker)
        resolve({
          stdout: '',
          stderr: 'Execution timeout',
          exitCode: 1,
        })
      }
    }, timeout)

    const onData = (data: Buffer) => {
      buffer += data.toString()

      // Look for complete JSON response
      const lines = buffer.split('\n')
      for (const line of lines) {
        if (line.includes('WORKER_READY')) {
          // Worker ready for next task - this is after our result
          continue
        }

        if (line.startsWith('{')) {
          try {
            const result = JSON.parse(line)
            if ('exitCode' in result && !resultReceived) {
              resultReceived = true
              clearTimeout(timeoutId)
              worker.proc.stdout?.off('data', onData)
              releaseWorker(worker)
              resolve({
                stdout: result.stdout ?? '',
                stderr: result.stderr ?? '',
                exitCode: result.exitCode ?? 0,
              })
              return
            }
          } catch {
            // Not valid JSON yet, continue buffering
          }
        }
      }

      // Keep incomplete line in buffer
      buffer = lines[lines.length - 1] || ''
    }

    worker.proc.stdout?.on('data', onData)

    // Send execution request
    const request = JSON.stringify({ code }) + '\n'
    worker.proc.stdin?.write(request)
  })
}

/**
 * 풀 종료
 */
export function shutdownPool(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }

  for (const worker of workers) {
    try {
      worker.proc.stdin?.write(JSON.stringify({ type: 'shutdown' }) + '\n')
      worker.proc.kill()
    } catch {
      // Ignore errors during shutdown
    }
  }

  workers = []
  initialized = false
}

/**
 * 풀 상태 확인
 */
export function getPoolStatus(): { total: number; available: number; busy: number } {
  return {
    total: workers.length,
    available: workers.filter(w => !w.busy).length,
    busy: workers.filter(w => w.busy).length,
  }
}

/**
 * 풀 초기화 여부
 */
export function isPoolInitialized(): boolean {
  return initialized
}
