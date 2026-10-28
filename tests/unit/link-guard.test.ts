import { describe, expect, it } from 'vitest'
import { assessLink } from '../../shared/link-guard'

const risks = (u: string, t?: string) => [...(assessLink(u, t)?.risks ?? [])].sort()

describe('assessLink', () => {
  it('only web, mail and phone links can be opened', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'file:///etc/passwd',
      'ftp://x.test',
      'intent://x',
      'not a url',
      'https://',
    ]) {
      expect(assessLink(bad), bad).toBeNull()
    }
    expect(assessLink('mailto:a@b.test')?.risks.size).toBe(0)
    expect(assessLink('tel:+4912345')?.risks.size).toBe(0)
  })

  it('plain https links are clean', () => {
    expect(risks('https://www.example.org/path?q=1')).toEqual([])
    expect(risks('https://example.org:443/x')).toEqual([])
  })

  it('flags IP hosts, punycode, http, userinfo and odd ports', () => {
    expect(risks('https://192.168.0.1/login')).toContain('ip_host')
    expect(risks('https://[::1]/x')).toContain('ip_host')
    expect(risks('https://xn--pple-43d.com/')).toContain('punycode')
    expect(risks('http://example.org/')).toContain('insecure_http')
    expect(risks('https://paypal.com@evil.test/')).toContain('user_info')
    expect(risks('https://example.org:8443/')).toContain('unusual_port')
    expect(risks('http://example.org:80/')).not.toContain('unusual_port')
  })

  it('flags text that names a different site than the target', () => {
    const a = assessLink('https://evil.test/x', 'https://www.mybank.com/login')
    expect(a?.risks.has('text_mismatch')).toBe(true)
    expect(a?.shownHost).toBe('www.mybank.com')
    expect(risks('https://mybank.com/a', 'www.mybank.com')).toEqual([])
    expect(risks('https://login.mybank.com/a', 'mybank.com')).toEqual([])
    expect(risks('https://evil.test/a', 'Click here')).toEqual([])
  })
})
