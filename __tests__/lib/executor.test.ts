import { describe, it, expect } from 'vitest'
import { validateCode, executePython } from '@/lib/executor'
import path from 'path'

const FIXTURES = path.join(__dirname, '..', 'fixtures')

describe('validateCode', () => {
  it('should allow safe pandas code', () => {
    const code = `import pandas as pd\ndf = pd.read_csv('test.csv')\nprint(df.describe())`
    expect(validateCode(code)).toEqual({ safe: true, reason: '' })
  })

  it('should block subprocess imports', () => {
    const code = `import subprocess\nsubprocess.run(['ls'])`
    const result = validateCode(code)
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('subprocess')
  })

  it('should block network imports', () => {
    const code = `import requests\nrequests.get('http://example.com')`
    const result = validateCode(code)
    expect(result.safe).toBe(false)
  })
})

describe('executePython', () => {
  it('should run simple print statement', async () => {
    const result = await executePython('print("hello world")', FIXTURES)
    expect(result.stdout.trim()).toBe('hello world')
    expect(result.exitCode).toBe(0)
  })

  it('should capture stderr on error', async () => {
    const result = await executePython('raise ValueError("test error")', FIXTURES)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('ValueError')
  })

  it('should timeout on long-running code', async () => {
    const result = await executePython('import time; time.sleep(60)', FIXTURES, 1000)
    expect(result.exitCode).not.toBe(0)
  }, 5000)
})
