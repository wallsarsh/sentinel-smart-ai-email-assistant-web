import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createTestDb } from '../../server/db/client'
import { secrets, users } from '../../server/db/schema'
import { open, seal } from '../../server/security/crypto'
import { rotateKek, secretStoreFor, type KekRing } from '../../server/security/secret-store'

let t: Awaited<ReturnType<typeof createTestDb>>
let u1: string
let u2: string
const ring: KekRing = { current: { version: 1, key: randomBytes(32) } }

beforeAll(async () => {
  t = await createTestDb()
  const rows = await t.db
    .insert(users)
    .values([
      { email: 'a@x.test', passwordHash: 'h' },
      { email: 'b@x.test', passwordHash: 'h' },
    ])
    .returning()
  u1 = rows[0]!.id
  u2 = rows[1]!.id
})
afterAll(async () => t.close())

describe('crypto', () => {
  it('round trips and detects tampering and wrong context', () => {
    const k = randomBytes(32)
    const ct = seal(k, Buffer.from('hello'), 'ctx')
    expect(open(k, ct, 'ctx').toString()).toBe('hello')
    expect(() => open(k, ct, 'other')).toThrow()
    const raw = Buffer.from(ct, 'base64')
    raw[raw.length - 1]! ^= 1
    expect(() => open(k, raw.toString('base64'), 'ctx')).toThrow()
    expect(() => open(randomBytes(32), ct, 'ctx')).toThrow()
  })
  it('uses a fresh nonce each time', () => {
    const k = randomBytes(32)
    expect(seal(k, Buffer.from('x'), 'c')).not.toBe(seal(k, Buffer.from('x'), 'c'))
  })
})

describe('secret store', () => {
  it('stores ciphertext only', async () => {
    const s = secretStoreFor(t.db, u1, ring)
    await s.put('imap.password', 'hunter2-super-secret')
    const rows = await t.db.select().from(secrets)
    for (const r of rows) {
      expect(r.ciphertext).not.toContain('hunter2')
      expect(Buffer.from(r.ciphertext, 'base64').toString('latin1')).not.toContain('hunter2')
    }
    expect(await s.get('imap.password')).toBe('hunter2-super-secret')
  })

  it('overwrites, deletes and reports missing as null', async () => {
    const s = secretStoreFor(t.db, u1, ring)
    await s.put('k', 'one')
    await s.put('k', 'two')
    expect(await s.get('k')).toBe('two')
    await s.delete('k')
    expect(await s.get('k')).toBeNull()
    expect(await s.get('never')).toBeNull()
  })

  it('isolates users and refuses moved ciphertext', async () => {
    const a = secretStoreFor(t.db, u1, ring)
    const b = secretStoreFor(t.db, u2, ring)
    await a.put('same-name', 'alice')
    await b.put('same-name', 'bob')
    expect(await a.get('same-name')).toBe('alice')
    expect(await b.get('same-name')).toBe('bob')
    // Move alice's ciphertext into bob's row: it must not decrypt.
    const [row] = await t.db.select().from(secrets)
    expect(row).toBeTruthy()
    const all = await t.db.select().from(secrets)
    const aliceRow = all.find((r) => r.userId === u1 && r.name === 'same-name')!
    const { and, eq } = await import('drizzle-orm')
    await t.db
      .update(secrets)
      .set({ ciphertext: aliceRow.ciphertext })
      .where(and(eq(secrets.userId, u2), eq(secrets.name, 'same-name')))
    await expect(b.get('same-name')).rejects.toThrow()
  })

  it('deleteAll removes everything of that user only', async () => {
    const a = secretStoreFor(t.db, u1, ring)
    const b = secretStoreFor(t.db, u2, ring)
    await a.put('x', '1')
    await b.put('y', '2')
    await a.deleteAll()
    expect(await a.get('x')).toBeNull()
    expect(await b.get('y')).toBe('2')
  })

  it('rotating the KEK re-wraps keys and keeps secrets readable', async () => {
    const a = secretStoreFor(t.db, u1, ring)
    await a.put('r', 'rotate-me')
    const next: KekRing = {
      current: { version: 2, key: randomBytes(32) },
      previous: [ring.current],
    }
    expect(await rotateKek(t.db, next)).toBeGreaterThanOrEqual(1)
    expect(await secretStoreFor(t.db, u1, next).get('r')).toBe('rotate-me')
    // Old KEK alone no longer opens the wrapped keys.
    await expect(secretStoreFor(t.db, u1, ring).get('r')).rejects.toThrow()
    // Idempotent.
    expect(await rotateKek(t.db, next)).toBe(0)
  })
})
