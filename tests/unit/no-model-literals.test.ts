import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) =>
    statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)],
  )

describe('model names', () => {
  it('are never hard-coded in app code (they come from the user, catalog or presets data)', () => {
    const offenders = [...walk('server'), ...walk('app'), ...walk('shared'), ...walk('worker')]
      .filter((f) => /\.(ts|vue|mjs)$/.test(f) && !/presets\.ts$/.test(f))
      .filter((f) =>
        /['"`](claude-[a-z0-9.-]+|gpt-[a-z0-9.-]+|o[134]-[a-z0-9.-]+)['"`]/.test(
          readFileSync(f, 'utf8'),
        ),
      )
    expect(offenders).toEqual([])
  })
})
