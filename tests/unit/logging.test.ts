import { describe, expect, it } from 'vitest'
import { scrub } from '../../shared/scrub'
import { createLogger } from '../../server/utils/logger'

describe('scrub', () => {
  it('removes emails, keys, bearer tokens, jwts, blobs', () => {
    const s = scrub(
      'from alex@acme.example key sk-ant-abcdefghijklmnop1234 Bearer abc.def-ghi jwt eyJhbGciOi.eyJzdWIiOiIx.sig123 ' +
        'x'.repeat(80),
    )
    expect(s).not.toMatch(/alex@|sk-ant|abc\.def|eyJ|xxxxxxxx/)
    expect(s).toContain('[email]')
  })
  it('keeps harmless diagnostics', () => {
    expect(scrub('sync finished: 12 new in 340ms')).toBe('sync finished: 12 new in 340ms')
  })
  it('redacts password-like assignments', () => {
    expect(scrub('password=hunter2')).not.toContain('hunter2')
  })
})

describe('logger', () => {
  function capture() {
    const lines: string[] = []
    return {
      lines,
      log: createLogger({ level: 'debug', destination: { write: (s) => void lines.push(s) } }),
    }
  }
  it('writes allow-listed fields and scrubs them', () => {
    const { lines, log } = capture()
    log.info('synced', { requestId: 'r1', count: 3, code: 'alex@acme.example' })
    const o = JSON.parse(lines[0]!)
    expect(o.requestId).toBe('r1')
    expect(o.count).toBe(3)
    expect(o.code).toBe('[email]')
  })
  it('drops fields that are not allow-listed at runtime', () => {
    const { lines, log } = capture()
    log.info('x', { subject: 'Secret subject', body: 'text' } as never)
    expect(lines[0]).not.toMatch(/Secret subject|text/)
  })
  it('scrubs error messages and keeps the type', () => {
    const { lines, log } = capture()
    log.error('failed', { requestId: 'r' }, new Error('bad for bob@x.test'))
    const o = JSON.parse(lines[0]!)
    expect(o.errType).toBe('Error')
    expect(o.errMsg).toBe('bad for [email]')
  })
  it('child loggers carry request ids', () => {
    const { lines, log } = capture()
    log.child({ requestId: 'req-9' }).info('hello')
    expect(JSON.parse(lines[0]!).requestId).toBe('req-9')
  })
})
