// Screenshot regression for the key screens, light and dark, at phone, tablet, desktop and 200% zoom.
// Baselines live in tests/visual/__baselines__. Regenerate after an intended change with
//   UPDATE_VISUAL=1 npx vitest run tests/visual
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright')
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const BASE = join(ROOT, 'tests/visual/__baselines__')
const OUT = join(ROOT, 'tests/visual/__output__')
const UPDATE = process.env.UPDATE_VISUAL === '1'

export const SCENES = ['brief', 'inbox', 'detail', 'composer', 'confirmation', 'settings']
export const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
  // A 1280 px window at 200% browser zoom lays out like a 640 px window.
  zoom200: { width: 640, height: 400 },
} as const
const SCHEMES = ['light', 'dark'] as const

let server: ViteDevServer
let url = ''
let browser: import('playwright').Browser

beforeAll(async () => {
  const tailwind = createRequire(import.meta.url)('tailwindcss') as (c: string) => unknown
  server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'silent',
    plugins: [vue()],
    resolve: {
      alias: {
        vue: 'vue/dist/vue.esm-bundler.js',
        '#shared': join(ROOT, 'shared'),
        '~~': ROOT,
        '~': join(ROOT, 'app'),
      },
    },
    css: {
      postcss: { plugins: [tailwind(join(ROOT, 'tests/visual/tailwind.config.cjs')) as never] },
    },
    server: { port: 0, host: '127.0.0.1' },
    optimizeDeps: { noDiscovery: true },
  })
  await server.listen()
  const addr = server.httpServer!.address() as { port: number }
  url = `http://127.0.0.1:${addr.port}/tests/visual/gallery/index.html`
  browser = await chromium.launch()
}, 60_000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

async function open(
  scene: string,
  vp: { width: number; height: number },
  scheme: 'light' | 'dark',
) {
  const ctx = await browser.newContext({
    viewport: vp,
    colorScheme: scheme,
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${url}?scene=${scene}`)
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(150)
  return { ctx, page, errors }
}

/** Counts pixels that differ noticeably; decoding happens in the browser so no image library is needed. */
async function diff(a: Buffer, b: Buffer) {
  const page = await browser.newPage()
  try {
    return await page.evaluate(
      async ([x, y]) => {
        const load = async (b64: string) => {
          const img = new Image()
          img.src = `data:image/png;base64,${b64}`
          await img.decode()
          const c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          const g = c.getContext('2d')!
          g.drawImage(img, 0, 0)
          return g.getImageData(0, 0, c.width, c.height)
        }
        const [p, q] = [await load(x!), await load(y!)]
        if (p.width !== q.width || p.height !== q.height)
          return { sizeChanged: true, ratio: 1, size: [p.width, p.height, q.width, q.height] }
        let n = 0
        for (let i = 0; i < p.data.length; i += 4)
          if (
            Math.abs(p.data[i]! - q.data[i]!) > 24 ||
            Math.abs(p.data[i + 1]! - q.data[i + 1]!) > 24 ||
            Math.abs(p.data[i + 2]! - q.data[i + 2]!) > 24
          )
            n++
        return {
          sizeChanged: false,
          ratio: n / (p.width * p.height),
          size: [p.width, p.height, q.width, q.height],
        }
      },
      [a.toString('base64'), b.toString('base64')] as const,
    )
  } finally {
    await page.close()
  }
}

describe('visual regression', () => {
  for (const scene of SCENES)
    for (const [vpName, vp] of Object.entries(VIEWPORTS))
      for (const scheme of SCHEMES)
        it(`${scene} · ${vpName} · ${scheme}`, async () => {
          const { ctx, page, errors } = await open(scene, vp, scheme)
          try {
            expect(errors).toEqual([])
            const shot = await page.screenshot({ fullPage: true })
            const name = `${scene}-${vpName}-${scheme}.png`
            const baseline = join(BASE, name)
            if (UPDATE || !existsSync(baseline)) {
              mkdirSync(BASE, { recursive: true })
              writeFileSync(baseline, shot)
              if (!UPDATE)
                throw new Error(`no baseline for ${name}: wrote one, review and commit it`)
              return
            }
            const r = await diff(readFileSync(baseline), shot)
            if (r.sizeChanged || r.ratio > 0.002) {
              mkdirSync(OUT, { recursive: true })
              writeFileSync(join(OUT, name), shot)
            }
            expect(r, `${name} changed (actual saved in tests/visual/__output__)`).toMatchObject({
              sizeChanged: false,
            })
            expect(r.ratio, `${name} differs from its baseline`).toBeLessThanOrEqual(0.002)
          } finally {
            await ctx.close()
          }
        }, 30_000)
})

describe('responsive polish', () => {
  it.each(SCENES)(
    '%s reflows at 320 px without sideways scrolling, in both schemes',
    async (scene) => {
      for (const scheme of SCHEMES) {
        const { ctx, page } = await open(scene, { width: 320, height: 640 }, scheme)
        try {
          const overflow = await page.evaluate(() => ({
            page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            wide: [...document.querySelectorAll('body *')]
              .filter(
                (el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
              )
              .filter(
                (el) =>
                  !el.closest('[data-testid=body]') && getComputedStyle(el).position !== 'fixed',
              )
              .slice(0, 3)
              .map((el) => `${el.tagName}.${(el as HTMLElement).className}`),
          }))
          expect(overflow, `${scene}/${scheme}`).toEqual({ page: 0, wide: [] })
        } finally {
          await ctx.close()
        }
      }
    },
    30_000,
  )

  it.each(SCENES)(
    '%s keeps tap targets at least 24 px tall on a phone',
    async (scene) => {
      const { ctx, page } = await open(scene, VIEWPORTS.mobile, 'light')
      try {
        const small = await page.evaluate(() =>
          [...document.querySelectorAll('button, a[href], input, select, textarea')]
            .filter((el) => !(el as HTMLInputElement).hidden && el.getClientRects().length > 0)
            .filter((el) => !el.classList.contains('sr-only')) // the skip link: hidden until focused
            .filter((el) => {
              const r = el.getBoundingClientRect()
              const inline = getComputedStyle(el).display === 'inline'
              return (
                !inline &&
                r.height < 24 &&
                !['checkbox', 'radio'].includes((el as HTMLInputElement).type)
              )
            })
            .map((el) => `${el.tagName}:${(el.textContent || '').trim().slice(0, 24)}`),
        )
        expect(small).toEqual([])
      } finally {
        await ctx.close()
      }
    },
    30_000,
  )
})
