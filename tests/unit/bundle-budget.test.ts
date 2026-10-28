import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without types
import { BUDGET, check, measure } from '../../tools/bundle-budget.mjs'

describe('bundle budget', () => {
  it('measures gzip sizes of JS and CSS, including subfolders, and ignores other files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-'))
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'a.js'), 'x'.repeat(10_000)) // compresses to almost nothing
    writeFileSync(join(dir, 'sub', 'b.js'), randomBytes(5000)) // incompressible
    writeFileSync(join(dir, 'c.css'), 'a{b:c}')
    writeFileSync(join(dir, 'd.png'), randomBytes(50_000))
    const m = measure(dir)
    expect(m.files).toBe(2)
    expect(m.jsLargestChunk).toBeGreaterThan(5000)
    expect(m.largestFile).toContain('b.js')
    expect(m.jsTotal).toBeGreaterThan(m.jsLargestChunk)
    expect(m.cssTotal).toBeGreaterThan(0)
    expect(m.cssTotal).toBeLessThan(100)
  })

  it('reports each budget that is exceeded and nothing when within', () => {
    const ok = { jsTotal: 1, jsLargestChunk: 1, cssTotal: 1 }
    expect(check(ok)).toEqual([])
    expect(check({ ...ok, jsTotal: BUDGET.jsTotal + 1 })).toEqual([
      expect.stringContaining('jsTotal'),
    ])
    expect(check({ jsTotal: 1e9, jsLargestChunk: 1e9, cssTotal: 1e9 })).toHaveLength(3)
  })
})
