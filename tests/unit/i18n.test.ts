import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const load = (n: string) => JSON.parse(readFileSync(`i18n/locales/${n}.json`, 'utf8'))
function keys(o: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )
}

describe('locales', () => {
  it('the pseudo-locale has exactly the English keys', () => {
    expect(keys(load('en-XA')).sort()).toEqual(keys(load('en')).sort())
  })
  it('the pseudo-locale is longer than English (truncation check)', () => {
    const en = load('en')
    const xa = load('en-XA')
    expect(xa.app.tagline.length).toBeGreaterThan(en.app.tagline.length * 1.2)
  })
})
