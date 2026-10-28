import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

const pascal = (s: string) => s.replace(/(^|[-_])(\w)/g, (_m, _a, c: string) => c.toUpperCase())

/** The names Nuxt registers for app/components: folder prefix + file name, without repeating the prefix. */
function nuxtNames(): Set<string> {
  const names = new Set<string>()
  for (const f of walk('app/components').filter((p) => p.endsWith('.vue'))) {
    const parts = relative('app/components', f)
      .replace(/\.vue$/, '')
      .split('/')
    const file = pascal(parts.pop()!)
    const prefix = parts.map(pascal).join('')
    names.add(file.startsWith(prefix) ? file : `${prefix}${file}`)
  }
  return names
}

const BUILTIN = new Set([
  'NuxtLink',
  'NuxtPage',
  'NuxtLayout',
  'ClientOnly',
  'Teleport',
  'Transition',
  'TransitionGroup',
  'KeepAlive',
  'Suspense',
  'NuxtErrorBoundary',
])

describe('component names', () => {
  it('every component used in a template exists under the name Nuxt gives it', () => {
    const known = nuxtNames()
    const unknown: string[] = []
    for (const f of walk('app').filter((p) => p.endsWith('.vue'))) {
      const tpl =
        /<template[^>]*>([\s\S]*)<\/template>\s*$/.exec(readFileSync(f, 'utf8'))?.[1] ?? ''
      for (const m of tpl.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) {
        const name = m[1]!
        if (!known.has(name) && !BUILTIN.has(name)) unknown.push(`${f}: <${name}>`)
      }
    }
    expect([...new Set(unknown)]).toEqual([])
  })
})
