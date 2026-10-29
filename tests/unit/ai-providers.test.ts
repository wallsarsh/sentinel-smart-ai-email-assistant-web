import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { aiProviderService, keySecret, MAX_PROVIDERS } from '../../server/ai/providers'
import { createTestDb } from '../../server/db/client'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { secretStoreFor } from '../../server/security/secret-store'
import { logger } from '../../server/utils/logger'
import { fakeAiHttp } from '../helpers/fake-ai-http'

const KEY = 'sk-test-abcdefghijklmnop1234'
async function setup(replies = [{ text: '{"data":[{"id":"m1"},{"id":"m2"}]}' }]) {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const other = await authRepo(db).createUser({ email: 'o@x.io', passwordHash: 'h' })
  const ring = { current: { version: 1, key: randomBytes(32) } }
  const fake = fakeAiHttp(replies)
  const svc = aiProviderService({
    db,
    ring,
    http: fake.http,
    resolver: async () => ['93.184.216.34'],
  })
  return { db, user, other, ring, svc, fake }
}

describe('ai provider service', () => {
  it('turns the model given at creation into the default route, once', async () => {
    const s = await setup()
    const r = await s.svc.create(s.user.id, { presetId: 'chatgpt', apiKey: KEY, model: 'm2' })
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    const routes = await forUser(s.db, s.user.id).ai.routes()
    expect(routes).toMatchObject([{ task: 'default', providerId: r.value.id, model: 'm2' }])
    await s.svc.create(s.user.id, { presetId: 'chatgpt', apiKey: KEY, model: 'm1' })
    expect(await forUser(s.db, s.user.id).ai.routes()).toHaveLength(1)
  })

  it('creates a provider, encrypts the key, refreshes models, and never returns the key', async () => {
    const s = await setup()
    const r = await s.svc.create(s.user.id, { presetId: 'chatgpt', apiKey: KEY })
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    expect(r.value).toMatchObject({
      kind: 'openai',
      status: 'ok',
      models: ['m1', 'm2'],
      keyHint: '…1234',
      consentGivenAt: null,
    })
    const dump = JSON.stringify([r.value, await s.svc.list(s.user.id)])
    expect(dump).not.toContain(KEY)
    expect(dump).not.toContain('abcdefghijklmnop')
    const raw = await forUser(s.db, s.user.id).secrets.getCiphertext(keySecret(r.value.id))
    expect(raw).not.toContain(KEY)
    expect(await secretStoreFor(s.db, s.user.id, s.ring).get(keySecret(r.value.id))).toBe(KEY)
    expect(JSON.stringify(await forUser(s.db, s.user.id).ai.list())).not.toContain(KEY)
  })

  it('key replacement keeps the provider, consent and id', async () => {
    const s = await setup([{ text: '{"data":[]}' }, { text: '{"data":[{"id":"n1"}]}' }])
    const c = await s.svc.create(s.user.id, { presetId: 'claude', apiKey: KEY })
    if (!c.ok) throw new Error('x')
    await forUser(s.db, s.user.id).ai.update(c.value.id, { consentGivenAt: new Date('2026-01-01') })
    const r = await s.svc.replaceKey(s.user.id, c.value.id, 'sk-new-0000000000009999')
    expect(r).toMatchObject({
      ok: true,
      value: { id: c.value.id, keyHint: '…9999', models: ['n1'] },
    })
    expect((r as { value: { consentGivenAt: Date } }).value.consentGivenAt).toEqual(
      new Date('2026-01-01'),
    )
    expect(s.fake.seen.at(-1)!.headers['x-api-key']).toBe('sk-new-0000000000009999')
  })

  it('marks the provider when the key is rejected', async () => {
    const s = await setup([{ status: 401 }])
    const r = await s.svc.create(s.user.id, { presetId: 'chatgpt', apiKey: KEY })
    expect(r).toMatchObject({ ok: true, value: { status: 'bad_key' } })
  })

  it('compatible providers need a public https base URL', async () => {
    const s = await setup()
    expect(
      await s.svc.create(s.user.id, {
        presetId: 'compatible',
        apiKey: KEY,
        baseUrl: 'http://x.test/v1',
      }),
    ).toMatchObject({ ok: false, error: { kind: 'validation', field: 'baseUrl' } })
    expect(await s.svc.create(s.user.id, { presetId: 'compatible', apiKey: KEY })).toMatchObject({
      ok: false,
    })
    const ok = await s.svc.create(s.user.id, {
      presetId: 'compatible',
      apiKey: KEY,
      baseUrl: 'https://llm.example.com/v1/',
      options: { authHeader: 'api-key' },
    })
    expect(ok).toMatchObject({
      ok: true,
      value: { baseUrl: 'https://llm.example.com/v1', options: { authHeader: 'api-key' } },
    })
    expect(
      await s.svc.create(s.user.id, { presetId: 'chatgpt', apiKey: KEY, options: { evil: 1 } }),
    ).toMatchObject({ ok: false })
  })

  it('validates input, enforces the limit, scopes by user, and deletes the key with the provider', async () => {
    const s = await setup(Array.from({ length: 20 }, () => ({ text: '{"data":[]}' })))
    expect(await s.svc.create(s.user.id, { presetId: 'nope', apiKey: KEY })).toMatchObject({
      ok: false,
    })
    expect(await s.svc.create(s.user.id, { presetId: 'chatgpt', apiKey: 'short' })).toMatchObject({
      ok: false,
      error: { field: 'apiKey' },
    })
    let first = ''
    for (let i = 0; i < MAX_PROVIDERS; i++) {
      const r = await s.svc.create(s.user.id, { presetId: 'chatgpt', apiKey: KEY })
      if (r.ok && !first) first = r.value.id
    }
    expect(await s.svc.create(s.user.id, { presetId: 'chatgpt', apiKey: KEY })).toMatchObject({
      error: { code: 'limit_reached' },
    })
    expect(await s.svc.replaceKey(s.other.id, first, KEY)).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    })
    expect(await s.svc.remove(s.other.id, first)).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    })
    expect((await s.svc.remove(s.user.id, first)).ok).toBe(true)
    expect(await secretStoreFor(s.db, s.user.id, s.ring).get(keySecret(first))).toBeNull()
  })

  it('instances use the stored key; a missing key is an auth failure', async () => {
    const s = await setup()
    const c = await s.svc.create(s.user.id, { presetId: 'chatgpt', apiKey: KEY })
    if (!c.ok) throw new Error('x')
    const row = (await forUser(s.db, s.user.id).ai.get(c.value.id))!
    expect((await s.svc.instance(s.user.id, row)).ok).toBe(true)
    await secretStoreFor(s.db, s.user.id, s.ring).delete(keySecret(row.id))
    expect(await s.svc.instance(s.user.id, row)).toMatchObject({
      ok: false,
      error: { kind: 'auth' },
    })
  })

  it('the logger redacts API keys even if one is passed in a code field', () => {
    const lines: string[] = []
    const orig = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((c: string | Uint8Array) => (
      lines.push(String(c)),
      true
    )) as typeof process.stdout.write
    try {
      logger.info('ai.test', { code: `bad key ${KEY}`, provider: 'openai' })
    } finally {
      process.stdout.write = orig
    }
    expect(lines.join('')).not.toContain(KEY)
  })
})
