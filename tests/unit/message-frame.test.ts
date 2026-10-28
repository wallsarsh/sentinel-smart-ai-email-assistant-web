import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildFrameDoc,
  decideLink,
  frameCsp,
  FRAME_SCRIPT,
  FRAME_SCRIPT_HASH,
  parseFrameMessage,
} from '../../app/utils/message-frame'

describe('message frame', () => {
  it('the CSP hash matches the script', () => {
    expect(FRAME_SCRIPT_HASH).toBe(
      'sha256-' + createHash('sha256').update(FRAME_SCRIPT).digest('base64'),
    )
  })
  it('CSP allows no remote content by default, https images only after opt-in', () => {
    expect(frameCsp(false)).toContain('img-src data:;')
    expect(frameCsp(true)).toContain('img-src data: https:')
    expect(frameCsp(true)).toContain("default-src 'none'")
  })
  it('only https images are enabled on opt-in', () => {
    const html =
      '<img data-remote-src="https://a.test/x.png"><img data-remote-src="http://a.test/y.png">'
    expect(buildFrameDoc(html)).not.toMatch(/ src="/)
    const on = buildFrameDoc(html, { loadImages: true })
    expect(on).toContain(' src="https://a.test/x.png"')
    expect(on).not.toContain(' src="http://')
  })
  it('accepts only well-formed frame messages and clamps height', () => {
    expect(parseFrameMessage({ sentinel: 'height', value: 99999 })).toEqual({
      sentinel: 'height',
      value: 20000,
    })
    expect(parseFrameMessage({ sentinel: 'height', value: NaN })).toBeNull()
    expect(parseFrameMessage({ sentinel: 'link', href: 5, text: '' })).toBeNull()
    expect(parseFrameMessage('x')).toBeNull()
    expect(parseFrameMessage({ sentinel: 'other' })).toBeNull()
  })
  it('decides link handling', () => {
    expect(decideLink('javascript:alert(1)', 'x')).toEqual({ action: 'ignore' })
    expect(decideLink('https://good.test/a', 'good.test')).toMatchObject({ action: 'open' })
    expect(decideLink('mailto:a@b.test', '')).toMatchObject({ action: 'open' })
    const bad = decideLink('http://1.2.3.4/x', 'bank.com')
    expect(bad.action).toBe('confirm')
    if (bad.action === 'confirm')
      expect([...bad.assessment.risks]).toEqual(
        expect.arrayContaining(['ip_host', 'insecure_http']),
      )
  })
})
