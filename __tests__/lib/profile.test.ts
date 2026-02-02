import { describe, it, expect } from 'vitest'
import { buildProfileScript } from '@/lib/profile'

describe('buildProfileScript', () => {
  it('should generate valid Python code', () => {
    const code = buildProfileScript('/path/to/test.csv')
    expect(code).toContain('pd.read_csv')
    expect(code).toContain('/path/to/test.csv')
    expect(code).toContain('json.dumps')
    expect(code).toContain('qualityScore')
  })

  it('should include quality checks', () => {
    const code = buildProfileScript('/path/to/test.csv')
    expect(code).toContain('missing')
    expect(code).toContain('outlier')
    expect(code).toContain('duplicate')
    expect(code).toContain('correlations')
    expect(code).toContain('distributions')
  })

  it('should use IQR method for outlier detection', () => {
    const code = buildProfileScript('/test.csv')
    expect(code).toContain('Q1')
    expect(code).toContain('Q3')
    expect(code).toContain('IQR')
    expect(code).toContain('1.5*IQR')
  })

  it('should compute quality score from warnings count', () => {
    const code = buildProfileScript('/test.csv')
    expect(code).toContain('100 - total_issues * 10')
  })
})
