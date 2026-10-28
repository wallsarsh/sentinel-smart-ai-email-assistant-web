import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { check as sendGateCheck } from '../../tools/send-gate-check.mjs'
import { createTestDb } from '../../server/db/client'
import { CapabilityError, FORBIDDEN_CAPABILITIES, workerContainer } from '../../worker/container'

const KEK = Buffer.alloc(32, 7).toString('base64')
beforeAll(() => {
  Object.assign(process.env, {
    BASE_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgres://u:p@localhost:5432/x',
    KEK_BASE64: KEK,
    SESSION_SECRET: 's'.repeat(40),
    NODE_ENV: 'test',
  })
})

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) =>
    statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)],
  )

describe('worker container', () => {
  it('provides read access, AI and triage', async () => {
    const { db } = await createTestDb()
    const c = workerContainer(db, { hubBridge: false })
    expect(c.resolve('db')).toBe(db)
    for (const k of ['providerFor', 'triage', 'ai', 'publish'] as const)
      expect(c.resolve(k)).toBeTruthy()
  })

  it.each([...FORBIDDEN_CAPABILITIES, 'somethingUnknown'])(
    'resolving "%s" throws',
    async (name) => {
      const { db } = await createTestDb()
      const c = workerContainer(db, { hubBridge: false })
      expect(() => c.resolve(name as never)).toThrow(CapabilityError)
      expect(name in c, name).toBe(false) // not reachable as a property either
    },
  )

  it('no worker file imports the send module, draft saving or the web container', () => {
    const bad = walk('worker')
      .filter((f) => /\.(ts|mjs)$/.test(f))
      .filter((f) =>
        /from '[^']*(mail\/send|drafts\/save|server\/container'|sendConfirmation|send-gate)/.test(
          readFileSync(f, 'utf8'),
        ),
      )
    expect(bad).toEqual([])
    expect(walk('worker').length).toBeGreaterThan(0)
  })

  it('the send-gate architecture check covers the worker', () => {
    expect(sendGateCheck('.', [])).toEqual([])
    const src = readFileSync('tools/send-gate-check.mjs', 'utf8')
    expect(src).toContain("'worker'")
  })
})
