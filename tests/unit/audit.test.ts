import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS tool
import { failing } from '../../tools/audit.mjs'

const report = {
  vulnerabilities: {
    a: { severity: 'high', via: [{ source: 1 }] },
    b: { severity: 'low', via: [{ source: 2 }] },
    c: { severity: 'critical', via: [{ source: 3 }] },
  },
}

describe('audit gate', () => {
  it('fails on high and critical only', () => {
    expect(failing(report, [])).toEqual(['a (high)', 'c (critical)'])
  })
  it('honours unexpired allowlist entries', () => {
    const allow = [{ id: 1, reason: 'x', expires: '2999-01-01' }]
    expect(failing(report, allow)).toEqual(['c (critical)'])
  })
  it('ignores expired entries', () => {
    const allow = [{ id: 1, reason: 'x', expires: '2000-01-01' }]
    expect(failing(report, allow)).toContain('a (high)')
  })
})
