import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createTestDb } from '../../server/db/client'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { pushPayload, PUSH_ACTIONS } from '../../server/push/payload'
import { pushService, type PushTransport } from '../../server/push/service'
import { disablePush, enablePush, keyToBytes, pushState } from '../../app/utils/push'

const UUID = '11111111-1111-4111-8111-111111111111'
const sub = (n: number) => ({
  endpoint: `https://push.example/${n}`,
  keys: { p256dh: 'p'.repeat(20) + n, auth: 'a'.repeat(10) + n },
})

async function setup(statuses: Record<string, number | 'throw'> = {}) {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({ email: 'u@x.io', passwordHash: 'h' })
  const other = await authRepo(db).createUser({ email: 'o@x.io', passwordHash: 'h' })
  const sent: { endpoint: string; body: string; ttl: number }[] = []
  const transport: PushTransport = async (s, body, o) => {
    sent.push({ endpoint: s.endpoint, body, ttl: o.ttl })
    const st = statuses[s.endpoint] ?? 201
    if (st === 'throw') throw new Error('network')
    return { status: st }
  }
  let t = new Date('2026-10-28T10:00:00Z')
  const svc = pushService({ db, transport, now: () => t })
  return { db, user, other, svc, sent, advance: (ms: number) => (t = new Date(t.getTime() + ms)) }
}

describe('push payload', () => {
  it('allows a kind and ids only', () => {
    for (const ok of [
      { type: 'message', messageId: UUID },
      { type: 'brief', briefId: UUID },
      { type: 'account', accountId: UUID },
      { type: 'send', ref: 'a'.repeat(16), state: 'sent' },
      { type: 'test' },
    ])
      expect(pushPayload.safeParse(ok).success, JSON.stringify(ok)).toBe(true)
  })
  it.each([
    [{ type: 'message', messageId: UUID, subject: 'Q3 numbers' }],
    [{ type: 'message', messageId: UUID, from: 'alex@acme.example' }],
    [{ type: 'message', messageId: 'not-an-id' }],
    [{ type: 'message', messageId: 'Q3 numbers from Alex <alex@acme.example>' }],
    [{ type: 'brief', briefId: UUID, headline: 'Pay the invoice' }],
    [{ type: 'test', body: 'x' }],
    [{ type: 'reply', messageId: UUID }],
    [{ type: 'send', ref: 'x', state: 'sent' }],
  ])('rejects text or unknown shapes: %j', (p) =>
    expect(pushPayload.safeParse(p).success).toBe(false),
  )
  it('the only actions are Open and Mark done', () =>
    expect([...PUSH_ACTIONS]).toEqual(['open', 'done']))
})

describe('push service', () => {
  it('stores one subscription per endpoint, https only, and never lists keys', async () => {
    const s = await setup()
    expect((await s.svc.subscribe(s.user.id, sub(1), 'Firefox')).ok).toBe(true)
    expect(
      (
        await s.svc.subscribe(
          s.user.id,
          { ...sub(1), keys: { p256dh: 'q'.repeat(20), auth: 'b'.repeat(10) } },
          'Firefox',
        )
      ).ok,
    ).toBe(true)
    expect(
      await s.svc.subscribe(s.user.id, { ...sub(2), endpoint: 'http://push.example/2' }),
    ).toMatchObject({ ok: false, error: { kind: 'validation' } })
    expect(await s.svc.subscribe(s.user.id, { endpoint: 'https://x.test' })).toMatchObject({
      ok: false,
    })
    const devices = await s.svc.devices(s.user.id)
    expect(devices).toHaveLength(1)
    expect(JSON.stringify(devices)).not.toMatch(/p256dh|auth|endpoint|qqqq/)
    expect(await s.svc.devices(s.other.id)).toEqual([])
  })

  it('sends a validated, ids-only payload to every device of the user and to nobody else', async () => {
    const s = await setup()
    await s.svc.subscribe(s.user.id, sub(1))
    await s.svc.subscribe(s.user.id, sub(2))
    await s.svc.subscribe(s.other.id, sub(3))
    const r = await s.svc.send(s.user.id, { type: 'message', messageId: UUID })
    expect(r).toEqual({ delivered: 2, removed: 0, failed: 0 })
    expect(s.sent.map((x) => x.endpoint).sort()).toEqual([
      'https://push.example/1',
      'https://push.example/2',
    ])
    expect(JSON.parse(s.sent[0]!.body)).toEqual({ type: 'message', messageId: UUID })
    await expect(
      s.svc.send(s.user.id, { type: 'message', messageId: UUID, subject: 'leak' } as never),
    ).rejects.toThrow()
    expect(s.sent).toHaveLength(2) // nothing went out for the invalid payload
  })

  it('removes gone subscriptions (404/410), marks other failures, and recovers on success', async () => {
    const s = await setup({
      'https://push.example/1': 410,
      'https://push.example/2': 503,
      'https://push.example/3': 'throw',
    })
    for (const n of [1, 2, 3, 4]) await s.svc.subscribe(s.user.id, sub(n))
    expect(await s.svc.send(s.user.id, { type: 'test' })).toEqual({
      delivered: 1,
      removed: 1,
      failed: 2,
    })
    const list = await forUser(s.db, s.user.id).push.list()
    expect(list.map((x) => x.endpoint).sort()).toEqual([
      'https://push.example/2',
      'https://push.example/3',
      'https://push.example/4',
    ])
    expect(list.filter((x) => x.failedAt)).toHaveLength(2)
  })

  it('cleans up subscriptions that keep failing', async () => {
    const s = await setup({ 'https://push.example/2': 503 })
    await s.svc.subscribe(s.user.id, sub(1))
    await s.svc.subscribe(s.user.id, sub(2))
    await s.svc.send(s.user.id, { type: 'test' })
    expect(await s.svc.cleanup(s.user.id, 7)).toBe(0)
    s.advance(8 * 86_400_000)
    expect(await s.svc.cleanup(s.user.id, 7)).toBe(1)
    expect((await s.svc.devices(s.user.id)).length).toBe(1)
  })

  it('unsubscribing and removing a device are per user', async () => {
    const s = await setup()
    await s.svc.subscribe(s.user.id, sub(1))
    expect(await s.svc.unsubscribe(s.other.id, sub(1).endpoint)).toBe(false)
    const [d] = await s.svc.devices(s.user.id)
    expect(await s.svc.removeDevice(s.other.id, d!.id)).toBe(false)
    expect(await s.svc.unsubscribe(s.user.id, sub(1).endpoint)).toBe(true)
    expect(await s.svc.devices(s.user.id)).toEqual([])
  })
})

describe('service worker', () => {
  const src = readFileSync('public/sw.js', 'utf8')
  it('offers only Open and Mark done, and has no path to reply or send', () => {
    expect([...src.matchAll(/action: '([a-z]+)'/g)].map((m) => m[1])).toEqual([
      'open',
      'done',
      'open',
    ])
    expect(src).not.toMatch(/\/api\/send|reply|authorize|fetch\(/i)
  })
  it('never puts payload text into the notification: titles are fixed strings', () => {
    expect(src).not.toMatch(/data\.(subject|from|body|text|title)/)
    expect(src).toContain('tag:')
  })
})

describe('permission UX helpers', () => {
  const mkEnv = (
    o: {
      permission?: NotificationPermission
      subscribed?: boolean
      request?: NotificationPermission
      push?: boolean
    } = {},
  ) => {
    const calls: string[] = []
    let sub: {
      endpoint: string
      toJSON: () => object
      unsubscribe: () => Promise<boolean>
    } | null = o.subscribed
      ? {
          endpoint: 'https://p/1',
          toJSON: () => ({ keys: { p256dh: 'k', auth: 'a' } }),
          unsubscribe: async () => {
            calls.push('unsub')
            sub = null
            return true
          },
        }
      : null
    const pushManager = {
      getSubscription: async () => sub,
      subscribe: async (opt: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) => {
        calls.push(`subscribe:${opt.userVisibleOnly}:${opt.applicationServerKey.length}`)
        sub = {
          endpoint: 'https://p/new',
          toJSON: () => ({ keys: { p256dh: 'k', auth: 'a' } }),
          unsubscribe: async () => true,
        }
        return sub
      },
    }
    const reg = { pushManager }
    return {
      calls,
      env: {
        Notification: {
          permission: o.permission ?? 'default',
          requestPermission: async () => (calls.push('prompt'), o.request ?? 'granted'),
        },
        serviceWorker: {
          register: async () => (calls.push('register'), reg),
          ready: Promise.resolve(reg),
        },
        hasPushManager: o.push ?? true,
      },
    }
  }
  const KEY =
    'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'

  it('derives the state: unsupported, unconfigured, denied, off, on', async () => {
    expect(await pushState({ ...mkEnv().env, hasPushManager: false }, true)).toBe('unsupported')
    expect(await pushState(mkEnv().env, false)).toBe('unconfigured')
    expect(await pushState(mkEnv({ permission: 'denied' }).env, true)).toBe('denied')
    expect(await pushState(mkEnv({ permission: 'default' }).env, true)).toBe('off')
    expect(await pushState(mkEnv({ permission: 'granted' }).env, true)).toBe('off')
    expect(await pushState(mkEnv({ permission: 'granted', subscribed: true }).env, true)).toBe('on')
  })
  it('turning on asks permission, registers, subscribes with the server key and reports the subscription', async () => {
    const m = mkEnv()
    const got: unknown[] = []
    expect(await enablePush(m.env, KEY, async (s) => void got.push(s))).toBe('on')
    expect(m.calls).toEqual(['prompt', 'register', 'subscribe:true:65'])
    expect(got).toEqual([{ endpoint: 'https://p/new', keys: { p256dh: 'k', auth: 'a' } }])
  })
  it('a refused prompt subscribes nothing', async () => {
    const m = mkEnv({ request: 'denied' })
    expect(await enablePush(m.env, KEY, async () => undefined)).toBe('denied')
    expect(m.calls).toEqual(['prompt'])
    expect(await enablePush(mkEnv({ request: 'default' }).env, KEY, async () => undefined)).toBe(
      'off',
    )
  })
  it('turning off forgets the endpoint on the server and unsubscribes the browser', async () => {
    const m = mkEnv({ permission: 'granted', subscribed: true })
    const forgot: string[] = []
    await disablePush(m.env, async (e) => void forgot.push(e))
    expect(forgot).toEqual(['https://p/1'])
    expect(m.calls).toEqual(['unsub'])
  })
  it('decodes the VAPID key', () => expect(keyToBytes(KEY).length).toBe(65))
})
