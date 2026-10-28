import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '../../server/mail/sanitize'
import { sanitize, cleanStyle } from '../../server/mail/sanitize/core.mjs'

const XSS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '<svg onload=alert(1)><circle/></svg>',
  '<iframe src="https://evil.test"></iframe>',
  '<form action="https://evil.test"><input name=p></form>',
  '<div style="background:url(https://evil.test/x)">x</div>',
  '<div style="width:expression(alert(1))">x</div>',
  '<style>@import "https://evil.test/x.css"; body{display:none}</style>',
  '<link rel=stylesheet href="https://evil.test/x.css">',
  '<meta http-equiv="refresh" content="0;url=https://evil.test">',
  '<base href="https://evil.test/">',
  '<object data="x"></object><embed src="x">',
  '<math><mtext><script>alert(1)</script></mtext></math>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">',
  '<p onclick="alert(1)" onmouseover="alert(2)">x</p>',
  '<a href="  javascript:alert(1)">x</a>',
  '<button formaction="https://evil.test">x</button>',
]

describe('sanitizer: hostile corpus', () => {
  it.each(XSS)('neutralises %s', (payload) => {
    const { html } = sanitize(`<p>ok</p>${payload}`)
    expect(html).not.toMatch(
      /<script|<iframe|<form|<input|<button|<object|<embed|<svg|<math|<style|<link|<meta|<base/i,
    )
    expect(html).not.toMatch(/\son\w+\s*=/i)
    expect(html).not.toMatch(/javascript:|url\s*\(|expression|@import|formaction/i)
    expect(html).not.toMatch(/src=["']?https?:/i)
    expect(html).toContain('<p>ok</p>')
  })

  it('keeps ordinary formatting', () => {
    const { html } = sanitize(
      '<p style="color:#333;font-size:14px">Hi <b>there</b></p><table><tr><td>1</td></tr></table>',
    )
    expect(html).toContain('<b>there</b>')
    expect(html).toContain('<table>')
    expect(html).toContain('color:#333')
  })

  it('drops unsafe css declarations but keeps safe ones', () => {
    expect(cleanStyle('color:red; background:url(x); width:10px; behavior:url(y)')).toBe(
      'color:red; width:10px',
    )
  })
})

describe('sanitizer: links and images', () => {
  it('links open safely and only with web/mail schemes', () => {
    const { html } = sanitize('<a href="https://a.test/x">a</a><a href="ftp://x">b</a>')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).toContain('target="_blank"')
    expect(html).not.toContain('ftp:')
  })

  it('remote images are blocked and remembered; trackers removed', () => {
    const r = sanitize(
      '<img src="https://cdn.test/a.png" alt="a"><img src="https://t.test/p.gif" width="1" height="1">',
    )
    expect(r.blockedImages).toBe(2)
    expect(r.html).toContain('data-remote-src="https://cdn.test/a.png"')
    expect(r.html).not.toMatch(/\ssrc=/)
    expect(r.html).not.toContain('t.test')
  })

  it('opt-in keeps remote images, inline data images always survive', () => {
    const on = sanitize('<img src="https://cdn.test/a.png">', { allowRemoteImages: true })
    expect(on.html).toContain('src="https://cdn.test/a.png"')
    const data = sanitize('<img src="data:image/png;base64,AAAA">')
    expect(data.html).toContain('data:image/png;base64')
  })
})

describe('sanitizer: large bodies', () => {
  it('uses a worker above the threshold and stays correct and fast', async () => {
    const big =
      '<p>' +
      'hello world '.repeat(5000) +
      '</p><script>alert(1)</script>' +
      '<p>x</p>'.repeat(10000)
    expect(big.length).toBeGreaterThan(100_000)
    const t0 = Date.now()
    const r = await sanitizeHtml(big)
    expect(r.html).not.toContain('<script')
    expect(r.html).toContain('hello world')
    expect(Date.now() - t0).toBeLessThan(5000)
  }, 20000)
})
