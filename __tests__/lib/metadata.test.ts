import { describe, it, expect } from 'vitest'
import { extractMetadata } from '@/lib/metadata'
import path from 'path'

const FIXTURES = path.join(__dirname, '..', 'fixtures')

describe('extractMetadata', () => {
  it('should extract columns, rowCount, and sample from CSV', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'sample.csv'))
    expect(result.columns).toHaveLength(4)
    expect(result.columns[0].name).toBe('name')
    expect(result.columns[1].name).toBe('age')
    expect(result.columns[1].type).toBe('number')
    expect(result.columns[3].type).toBe('date')
    expect(result.rowCount).toBe(5)
    expect(result.sample).toHaveLength(5)
  })

  it('should handle Korean CSV', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'korean.csv'))
    expect(result.columns[0].name).toBe('이름')
    expect(result.rowCount).toBe(3)
  })

  it('should handle CSV with headers only', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'empty.csv'))
    expect(result.columns).toHaveLength(3)
    expect(result.rowCount).toBe(0)
    expect(result.sample).toHaveLength(0)
  })

  it('should compute numeric stats for number columns', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'sample.csv'))
    const ageCol = result.columns.find(c => c.name === 'age')!
    expect(ageCol.stats).toBeDefined()
    expect(ageCol.stats!.min).toBe(25)
    expect(ageCol.stats!.max).toBe(35)
    expect(ageCol.stats!.mean).toBe(30)
    expect(ageCol.stats!.median).toBe(30)
    expect(ageCol.stats!.std).toBeGreaterThan(0)
  })

  it('should compute topValues for string columns', async () => {
    const result = await extractMetadata(path.join(FIXTURES, 'sample.csv'))
    const nameCol = result.columns.find(c => c.name === 'name')!
    expect(nameCol.topValues).toBeDefined()
    expect(nameCol.topValues!.length).toBe(5)
    expect(nameCol.topValues![0]).toHaveProperty('value')
    expect(nameCol.topValues![0]).toHaveProperty('count')
  })
})
