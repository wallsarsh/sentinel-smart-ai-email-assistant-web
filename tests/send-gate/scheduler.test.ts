import { describe, expect, it } from 'vitest'
import { sendScheduler, type SendEvent } from '../../server/mail/send/scheduler'
import { sendGate } from '../../server/mail/send/send-gate'
import { err, ok } from '../../shared/errors/result'
import type { MailSender } from '../../server/mail/send/support'
import { sendRecorder } from '../../server/mail/send/records'
import { sendFixture } from './helpers'

async function setup(sendImpl?: (s: { calls: number }) => 'ok' | 'fail' | 'unknown') {
  const f = await sendFixture('gmail')
  let t = new Date()
  const state = { calls: 0 }
  const events: SendEvent[] = []
  const recorder = sendRecorder(f.db)
  const sender: MailSender = {
    async send(r) {
      state.calls++
      const rec = await recorder.begin(r.userId, r.content, {
        internetMessageId: '<m@x>',
        contentHash: r.contentHash,
      })
      await recorder.submitting(r.userId, rec.id)
      const mode = sendImpl?.(state) ?? 'ok'
      if (mode === 'ok') {
        await recorder.sent(r.userId, rec.id)
        return ok({ sendRecordId: rec.id, internetMessageId: '<m@x>', sentAt: new Date() })
      }
      if (mode === 'unknown') {
        await recorder.unknown(r.userId, rec.id)
        return err({ kind: 'provider', status: null, code: 'send_unknown' })
      }
      await recorder.failed(r.userId, rec.id, 'x')
      return err({ kind: 'provider', status: 400, code: '400' })
    },
    reconcile: async () => ok(false),
  }
  const gate = sendGate({ db: f.db, ring: f.ring, now: () => t })
  const mkScheduler = () =>
    sendScheduler({
      db: f.db,
      gate,
      senderFor: () => sender,
      notify: (_u, e) => events.push(e),
      now: () => t,
    })
  const authorize = async (undo = 5, c = f.content) => {
    const a = await gate.authorize(
      f.user.id,
      c,
      { confirmedAt: new Date(t), sessionId: 'sess-1', stepUpSatisfied: true },
      { undoSeconds: undo },
    )
    if (!a.ok) throw new Error(a.error)
    return a.value
  }
  return {
    ...f,
    state,
    events,
    gate,
    mkScheduler,
    authorize,
    advance: (ms: number) => (t = new Date(t.getTime() + ms)),
    now: () => t,
  }
}

describe('send scheduler (undo window)', () => {
  it('nothing is submitted before the release time, then exactly once', async () => {
    const s = await setup()
    const a = await s.authorize(5)
    const sched = s.mkScheduler()
    expect(await sched.tick()).toEqual({ released: 0 })
    s.advance(4999)
    expect(await sched.tick()).toEqual({ released: 0 })
    expect(s.state.calls).toBe(0)
    s.advance(1)
    expect(await sched.tick()).toEqual({ released: 1 })
    expect(await sched.tick()).toEqual({ released: 0 })
    expect(s.state.calls).toBe(1)
    expect(s.events).toEqual([{ ref: s.gate.hashNonce(a.nonce).slice(0, 16), state: 'sent' }])
    const row = (await s.repos.send.getAuthorization(s.gate.hashNonce(a.nonce)))!
    expect(row).toMatchObject({ state: 'used' })
    expect(row.recordId).not.toBeNull()
  })

  it('Undo before the release means nothing is ever sent', async () => {
    const s = await setup()
    const a = await s.authorize(5)
    expect(await s.gate.revoke(s.user.id, a.nonce)).toBe(true)
    s.advance(60_000)
    const sched = s.mkScheduler()
    expect(await sched.tick()).toEqual({ released: 0 })
    expect(s.state.calls).toBe(0)
  })

  it('a closed tab changes nothing: the server still releases at the right time', async () => {
    const s = await setup()
    await s.authorize(3)
    s.advance(3000)
    expect(await s.mkScheduler().tick()).toEqual({ released: 1 }) // a fresh scheduler, as after a restart
    expect(s.state.calls).toBe(1)
  })

  it('two instances ticking at once deliver exactly once', async () => {
    const s = await setup()
    await s.authorize(0)
    const [a, b, c] = [s.mkScheduler(), s.mkScheduler(), s.mkScheduler()]
    await Promise.all([a.tick(), b.tick(), c.tick()])
    expect(s.state.calls).toBe(1)
  })

  it('Undo racing the release: either sent once and undo refused, or cancelled and never sent', async () => {
    const s = await setup()
    const sched = s.mkScheduler()
    let expected = 0
    for (let i = 0; i < 20; i++) {
      const a = await s.authorize(0)
      let revoked: boolean
      if (i % 3 === 0)
        [, revoked] = await Promise.all([sched.tick(), s.gate.revoke(s.user.id, a.nonce)]) // release starts first
      else if (i % 3 === 1)
        [revoked] = await Promise.all([s.gate.revoke(s.user.id, a.nonce), sched.tick()]) // undo starts first
      else {
        await sched.tick() // released, then the user clicks Undo too late
        revoked = await s.gate.revoke(s.user.id, a.nonce)
      }
      await sched.tick()
      if (!revoked) expected++
      expect(s.state.calls, `iteration ${i}`).toBe(expected)
    }
    expect(expected).toBeGreaterThan(0)
  })

  it('an authorization that expired unseen (server was down) is cancelled, not sent late, and the user is told', async () => {
    const s = await setup()
    const a = await s.authorize(5)
    s.advance(5000 + 2 * 60_000 + 1)
    expect(await s.mkScheduler().tick()).toEqual({ released: 0 })
    expect(s.state.calls).toBe(0)
    expect(s.events).toEqual([{ ref: s.gate.hashNonce(a.nonce).slice(0, 16), state: 'expired' }])
    expect(await s.repos.send.getAuthorization(s.gate.hashNonce(a.nonce))).toMatchObject({
      state: 'revoked',
      endedReason: 'expired',
    })
    expect(await s.mkScheduler().tick()).toEqual({ released: 0 })
    expect(s.events).toHaveLength(1) // told once
  })

  it('a send whose session ended is cancelled with a notification', async () => {
    const s = await setup()
    await s.authorize(2)
    await s.db.execute("update sessions set revoked_at = now() where id = 'sess-1'")
    s.advance(2000)
    await s.mkScheduler().tick()
    expect(s.state.calls).toBe(0)
    expect(s.events.map((e) => e.state)).toEqual(['cancelled'])
  })

  it('reports provider outcomes: failed and unknown', async () => {
    for (const [mode, want] of [
      ['fail', 'failed'],
      ['unknown', 'unknown'],
    ] as const) {
      const s = await setup(() => mode)
      await s.authorize(0)
      await s.mkScheduler().tick()
      expect(s.events.map((e) => e.state)).toEqual([want])
      expect(s.state.calls).toBe(1)
    }
  })

  it('a failed send is never retried by a later tick', async () => {
    const s = await setup(() => 'fail')
    await s.authorize(0)
    const sched = s.mkScheduler()
    await sched.tick()
    s.advance(10_000)
    await sched.tick()
    await sched.tick()
    expect(s.state.calls).toBe(1)
  })

  it('start and stop run the loop without overlapping ticks', async () => {
    const s = await setup()
    await s.authorize(0)
    const sched = s.mkScheduler()
    sched.start(10)
    await new Promise((r) => setTimeout(r, 100))
    sched.stop()
    expect(s.state.calls).toBe(1)
  })
})
