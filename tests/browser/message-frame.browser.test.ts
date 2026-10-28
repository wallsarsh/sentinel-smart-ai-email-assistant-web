// Real-browser check that hostile mail is inert inside the message frame.
import { createRequire } from 'node:module'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildFrameDoc } from '../../app/utils/message-frame'
import { sanitize } from '../../server/mail/sanitize/core.mjs'
import { XSS } from '../fixtures-xss-corpus'

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright')
let browser: import('playwright').Browser

beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => browser?.close())

async function render(html: string, loadImages = false) {
  const page = await browser.newPage()
  const external: string[] = []
  const dialogs: string[] = []
  await page.route('**/*', (route) => {
    const u = route.request().url()
    if (/^(https?):\/\/(?!host\.test)/.test(u)) external.push(u)
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body><div id="host"></div></body></html>',
    })
  })
  page.on('dialog', (d) => {
    dialogs.push(d.message())
    void d.dismiss()
  })
  await page.goto('http://host.test/')
  const doc = buildFrameDoc(html, { loadImages })
  await page.evaluate((d) => {
    ;(window as unknown as { __x: number }).__x = 0
    window.addEventListener('message', (e) => {
      if ((e.data as { canary?: boolean })?.canary) (window as unknown as { __x: number }).__x++
    })
    const f = document.createElement('iframe')
    f.sandbox.add('allow-scripts')
    f.srcdoc = d
    document.getElementById('host')!.appendChild(f)
  }, doc)
  await page.waitForTimeout(400)
  const canary = await page.evaluate(() => (window as unknown as { __x: number }).__x)
  const top = page.url()
  await page.close()
  return { external, dialogs, canary, top }
}

describe('message frame in Chromium', () => {
  it.each(XSS)('sanitized: %s is inert', async (payload) => {
    const { html } = sanitize(`<p>ok</p>${payload}`)
    const r = await render(html)
    expect(r.dialogs).toEqual([])
    expect(r.canary).toBe(0)
    expect(r.external.filter((u) => !u.startsWith('data:'))).toEqual([])
    expect(r.top).toBe('http://host.test/')
  })

  it.each([
    `<img src=x onerror="parent.postMessage({canary:true},'*');alert(1)">`,
    `<script>parent.postMessage({canary:true},'*');alert(1)</script>`,
    `<svg onload="parent.postMessage({canary:true},'*')"></svg>`,
    `<img src="https://evil.test/track.gif">`,
    `<link rel=stylesheet href="https://evil.test/x.css"><style>@import url(https://evil.test/y.css)</style>`,
    `<iframe src="https://evil.test/"></iframe><form action="https://evil.test/"><button>x</button></form>`,
  ])('even unsanitized, the sandbox and CSP hold: %s', async (raw) => {
    const r = await render(raw)
    expect(r.dialogs).toEqual([])
    expect(r.canary).toBe(0)
    expect(r.external).toEqual([])
  })

  it('blocks remote images by default and loads them only after opt-in', async () => {
    const html = sanitize(
      '<p>hi</p><img src="https://img.test/a.png" width="200" height="100">',
    ).html
    expect((await render(html)).external).toEqual([])
    expect((await render(html, true)).external).toContain('https://img.test/a.png')
  })
})
