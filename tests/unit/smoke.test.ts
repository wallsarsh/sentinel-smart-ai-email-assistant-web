import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('project layout', () => {
  it('pins the node version', () => {
    expect(readFileSync('.nvmrc', 'utf8').trim()).toBe('22')
  })
  it('exposes the check script', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts.check).toContain('lint')
    expect(pkg.scripts.check).toContain('typecheck')
    expect(pkg.scripts.check).toContain('test')
  })
})
