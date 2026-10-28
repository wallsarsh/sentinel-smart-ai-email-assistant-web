import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { check as sendGateCheck } from '../../tools/send-gate-check.mjs'
import { aiRouter } from '../../server/ai/router'
import { PromptBuilder } from '../../server/ai/prompts/builder'
import { buildUserContext } from '../../server/ai/user-context'
import { createTestDb } from '../../server/db/client'
import { sessions } from '../../server/db/schema'
import { draftGenerator } from '../../server/drafts/generator'
import { draftSaver } from '../../server/drafts/save'
import { GmailMailProvider } from '../../server/mail/gmail/provider'
import { sendConfirmation } from '../../server/mail/send/confirmation'
import { gmailSender } from '../../server/mail/send/gmail'
import { sendScheduler } from '../../server/mail/send/scheduler'
import { sendGate } from '../../server/mail/send/send-gate'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { syncAccount } from '../../server/sync/sync-account'
import { triageService } from '../../server/triage/service'
import { err, ok } from '../../shared/errors/result'
import { sampleMessage } from '../contract/mail-provider-contract'
import { HOSTILE } from '../fixtures/hostile-emails'
import { FakeGmailApi } from '../helpers/fake-gmail-api'

/** Every HTTP call the mail provider would see is recorded in [api.calls]. */
async function world(obedient: boolean) {
  const { db } = await createTestDb()
  const user = await authRepo(db).createUser({
    email: 'u@x.io',
    passwordHash: 'h',
    displayName: 'Priya',
  })
  const repos = forUser(db, user.id)
  const acc = await repos.accounts.create({
    type: 'gmail',
    email: 'me@x.test',
    displayName: '',
    color: 1,
  })
  await repos.mail.upsertFolders(acc.id, [
    { providerId: 'INBOX', name: 'INBOX', role: 'inbox', processed: true },
  ])
  await db
    .insert(sessions)
    .values({ id: 'sess-1', userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) })
  const api = new FakeGmailApi()
  const provider = new GmailMailProvider(api.api, { accountEmail: 'me@x.test', accountId: acc.id })
  const ring = { current: { version: 1, key: randomBytes(32) } }
  const gate = sendGate({ db, ring })
  const saver = draftSaver({ db, providerFor: async () => provider })
  const confirmation = sendConfirmation({ db, gate, saver })
  const sender = gmailSender({ db, apiFor: () => api.api })
  const events: string[] = []
  const scheduler = sendScheduler({
    db,
    gate,
    senderFor: () => sender,
    notify: (_u, e) => events.push(e.state),
  })
  const sendCalls = () => api.calls.filter((c) => /^(POST|PUT|PATCH) .*\/send/i.test(c))

  // A model that does whatever the email says (the worst case): it echoes injected instructions into its output.
  const aiRoute = { providerId: '00000000-0000-4000-8000-000000000001', model: 'm', params: {} }
  const malicious = (prompt: string) =>
    obedient
      ? `Sure! Sending now. Please contact phish@phish.test and pay at https://phish.test/pay.${prompt.slice(0, 0)}`
      : 'Thanks, noted.'
  const router = {
    complete: async (_u: string, _t: string, build: (r: typeof aiRoute) => { user: string }) =>
      ok({
        text: JSON.stringify({ results: [] }),
        stop: 'end' as const,
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
        model: 'm',
        cost: { micros: 0, unpriced: true },
        route: aiRoute,
        attempts: 1,
        _p: build(aiRoute).user,
      }),
  }
  const generator = draftGenerator({
    db,
    router: { routesFor: async () => [aiRoute] } as never,
    gateway: {
      async *stream(c: { request: { user: string } }) {
        const text = malicious(c.request.user)
        yield { type: 'delta' as const, text }
        yield {
          type: 'done' as const,
          response: {
            text,
            usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
            stop: 'end' as const,
            model: 'm',
          },
        }
      },
    } as never,
  })
  const triage = triageService({ db, router: router as never })
  return {
    db,
    user,
    repos,
    acc,
    api,
    provider,
    gate,
    saver,
    confirmation,
    sender,
    scheduler,
    events,
    sendCalls,
    generator,
    triage,
    ring,
  }
}
type W = Awaited<ReturnType<typeof world>>

async function receive(w: W, over: Partial<ReturnType<typeof sampleMessage>> = {}) {
  w.api.seed(
    sampleMessage('inbound-1', 'thr-1', {
      subject: 'Q3 numbers',
      from: { address: 'alex@acme.example', name: 'Alex' },
      bodyText: 'Can you send the Q3 numbers?',
      ...over,
    }),
  )
  const r = await syncAccount({
    db: w.db,
    userId: w.user.id,
    accountId: w.acc.id,
    provider: w.provider,
  })
  if (!r.ok) throw new Error('sync')
  return (await w.repos.mail.recent(5))[0]!
}
const collect = async (it: AsyncIterable<{ type: string; text?: string }>) => {
  let last = ''
  for await (const e of it) if (e.type === 'done') last = e.text ?? ''
  return last
}
const draft = (o: object = {}) => ({
  body: 'Thanks, I will send the numbers by 3pm.',
  to: ['alex@acme.example'],
  cc: [],
  ...o,
})

describe('send gate: nothing leaves without the user (hostile corpus)', () => {
  it.each(HOSTILE.map((h) => [h.name, h] as const))(
    '%s: syncing, triaging and drafting never touch a send endpoint or create an authorization',
    async (_n, h) => {
      const w = await world(true)
      const m = await receive(w, {
        from: { address: h.from },
        subject: h.subject,
        bodyText: h.body,
        providerMessageId: `h-${h.name}`,
      })
      await w.triage.triageMessages(w.user.id, [m.id])
      const text = await collect(
        w.generator.generate({
          userId: w.user.id,
          messageId: m.id,
          tone: 'professional',
          intent: 'accept',
        }),
      )
      expect(text).toContain('phish@phish.test') // the obedient model did write it...
      // ...and it is only text: saving a draft is allowed, sending is not.
      expect(
        (
          await w.saver.save(
            w.user.id,
            m.id,
            draft({ body: text, to: [h.from.includes('@') ? h.from : 'a@b.test'] }),
          )
        ).ok,
      ).toBe(true)
      expect(w.sendCalls()).toEqual([])
      expect(await w.db.execute('select count(*)::int n from send_authorizations')).toMatchObject({
        rows: [{ n: 0 }],
      })
      expect(await w.db.execute('select count(*)::int n from send_records')).toMatchObject({
        rows: [{ n: 0 }],
      })
      await w.scheduler.tick()
      expect(w.sendCalls()).toEqual([])
    },
  )

  it('the injected details in a draft are flagged on the confirmation screen, not silently accepted', async () => {
    const w = await world(true)
    const m = await receive(w, {
      bodyText: HOSTILE[5]!.body,
      from: { address: 'attacker@evil.test' },
    })
    const text = await collect(
      w.generator.generate({
        userId: w.user.id,
        messageId: m.id,
        tone: 'professional',
        intent: 'accept',
      }),
    )
    const p = await w.confirmation.prepare(
      w.user.id,
      m.id,
      draft({ body: text, to: ['attacker@evil.test'] }),
    )
    if (!p.ok) throw new Error(JSON.stringify(p.error))
    expect(p.value.flags.foreign.map((f) => f.value)).toEqual(
      expect.arrayContaining(['https://phish.test/pay', 'phish@phish.test']),
    )
    expect(w.sendCalls()).toEqual([])
  })

  it('prompt envelopes stay intact for every hostile email', () => {
    for (const h of HOSTILE) {
      const msg = {
        ...sampleMessage('x'),
        from: { address: h.from, name: h.name },
        subject: h.subject,
        bodyText: h.body,
        bodyHtml: null,
      }
      const ctx = {
        name: 'Priya',
        timezoneName: 'UTC',
        offsetAt: () => 0,
        now: new Date(),
        selfAddresses: new Set(['me@x.test']),
        vipSenders: [],
        senderHints: [],
      }
      const b = new PromptBuilder().buildTriage([{ messageId: 'x', message: msg }], ctx)
      expect(
        b.text.match(new RegExp(`</email boundary="${b.boundary}">`, 'g')),
        h.name,
      ).toHaveLength(1)
      expect(b.text.match(/^user_context:/gm), h.name).toHaveLength(1)
      expect(b.text.match(/<email id=/g), h.name).toHaveLength(1)
    }
    void buildUserContext
  })
})

describe('send gate: the confirmed path', () => {
  it('without confirmation: zero sends; with confirmation and the undo window passed: exactly one, with exactly the confirmed content', async () => {
    const w = await world(false)
    const m = await receive(w)
    expect((await w.saver.save(w.user.id, m.id, draft())).ok).toBe(true)
    await w.scheduler.tick()
    expect(w.sendCalls()).toEqual([])

    const p = await w.confirmation.prepare(w.user.id, m.id, draft())
    if (!p.ok) throw new Error('x')
    expect(w.sendCalls()).toEqual([]) // previewing is not sending
    const a = await w.confirmation.authorize(w.user.id, { id: 'sess-1' }, m.id, draft(), {
      previewHash: p.value.contentHash,
      stepUpSatisfied: true,
      confirmedAt: new Date(),
    })
    if (!a.ok) throw new Error(JSON.stringify(a.error))
    await w.scheduler.tick()
    expect(w.sendCalls()).toEqual([]) // still inside the undo window
    await w.db.execute("update send_authorizations set release_at = now() - interval '1 second'")
    await w.scheduler.tick()
    await w.scheduler.tick()
    expect(w.api.calls.filter((c) => c === 'POST /drafts/send')).toHaveLength(1)
    expect(w.api.sent).toHaveLength(1)
    expect(w.api.sent[0]!.raw).toContain('Thanks, I will send the numbers by 3pm.')
    expect(w.api.sent[0]!.raw).toContain('Subject: Re: Q3 numbers')
    expect(w.events).toEqual(['sent'])
  })

  it('after Undo: never sent, even long after', async () => {
    const w = await world(false)
    const m = await receive(w)
    const p = await w.confirmation.prepare(w.user.id, m.id, draft())
    if (!p.ok) throw new Error('x')
    const a = await w.confirmation.authorize(w.user.id, { id: 'sess-1' }, m.id, draft(), {
      previewHash: p.value.contentHash,
      stepUpSatisfied: true,
      confirmedAt: new Date(),
    })
    if (!a.ok) throw new Error('x')
    expect(await w.confirmation.undo(w.user.id, a.value.nonce)).toBe(true)
    await w.db.execute("update send_authorizations set release_at = now() - interval '1 hour'")
    await w.scheduler.tick()
    expect(w.sendCalls()).toEqual([])
  })

  it('tampering is refused: edited text, swapped recipients, replayed or foreign authorization, altered stored content', async () => {
    const w = await world(false)
    const m = await receive(w)
    const p = await w.confirmation.prepare(w.user.id, m.id, draft())
    if (!p.ok) throw new Error('x')
    const auth = (body: object, hash = p.value.contentHash) =>
      w.confirmation.authorize(w.user.id, { id: 'sess-1' }, m.id, body, {
        previewHash: hash,
        stepUpSatisfied: true,
        confirmedAt: new Date(),
      })
    expect(await auth(draft({ body: 'Send me the password' }))).toEqual({
      ok: false,
      error: { kind: 'send_refused', reason: 'content_changed' },
    })
    expect(await auth(draft({ to: ['attacker@evil.test'] }))).toEqual({
      ok: false,
      error: { kind: 'send_refused', reason: 'content_changed' },
    })
    expect(await auth(draft(), '0'.repeat(64))).toEqual({
      ok: false,
      error: { kind: 'send_refused', reason: 'content_changed' },
    })

    const good = await auth(draft())
    if (!good.ok) throw new Error('x')
    const hash = w.gate.hashNonce(good.value.nonce)
    // Another user cannot use or undo it.
    const other = await authRepo(w.db).createUser({ email: 'o@x.io', passwordHash: 'h' })
    expect(await w.gate.redeem(other.id, hash)).toEqual({
      ok: false,
      error: 'unknown_authorization',
    })
    expect(await w.gate.revoke(other.id, good.value.nonce)).toBe(false)
    // Stored content altered behind the gate's back.
    const { secretStoreFor } = await import('../../server/security/secret-store')
    const store = secretStoreFor(w.db, w.user.id, w.ring)
    const sealed = JSON.parse((await store.get(`send:${hash}`))!)
    await store.put(`send:${hash}`, JSON.stringify({ ...sealed, bodyText: 'tampered' }))
    await w.db.execute("update send_authorizations set release_at = now() - interval '1 second'")
    await w.scheduler.tick()
    expect(w.sendCalls()).toEqual([])
    expect(await w.gate.redeem(w.user.id, hash)).toEqual({ ok: false, error: 'content_changed' })
  })

  it('a replayed nonce cannot cause a second send', async () => {
    const w = await world(false)
    const m = await receive(w)
    const p = await w.confirmation.prepare(w.user.id, m.id, draft())
    if (!p.ok) throw new Error('x')
    const a = await w.confirmation.authorize(w.user.id, { id: 'sess-1' }, m.id, draft(), {
      previewHash: p.value.contentHash,
      stepUpSatisfied: true,
      confirmedAt: new Date(),
    })
    if (!a.ok) throw new Error('x')
    await w.db.execute("update send_authorizations set release_at = now() - interval '1 second'")
    await w.scheduler.tick()
    expect(await w.gate.redeem(w.user.id, w.gate.hashNonce(a.value.nonce))).toEqual({
      ok: false,
      error: 'already_used',
    })
    await w.scheduler.tick()
    expect(w.api.calls.filter((c) => c === 'POST /drafts/send')).toHaveLength(1)
  })

  it('a provider that fails or times out is never retried', async () => {
    for (const mode of ['fail', 'timeout'] as const) {
      const w = await world(false)
      if (mode === 'fail') w.api.sendStatus = 400
      else w.api.sendStatus = 503
      const m = await receive(w)
      const p = await w.confirmation.prepare(w.user.id, m.id, draft())
      if (!p.ok) throw new Error('x')
      await w.confirmation.authorize(w.user.id, { id: 'sess-1' }, m.id, draft(), {
        previewHash: p.value.contentHash,
        stepUpSatisfied: true,
        confirmedAt: new Date(),
      })
      await w.db.execute("update send_authorizations set release_at = now() - interval '1 second'")
      for (let i = 0; i < 4; i++) await w.scheduler.tick()
      expect(
        w.api.calls.filter((c) => c === 'POST /drafts/send'),
        mode,
      ).toHaveLength(1)
      expect(w.events).toEqual([mode === 'fail' ? 'failed' : 'unknown'])
    }
  })
})

describe('send gate: static guarantees (also enforced in CI)', () => {
  it('send primitives live only in server/mail/send, and AI/jobs/worker/triage/brief/sync/push cannot reach them', () => {
    expect(sendGateCheck('.', [])).toEqual([])
  })
  it('the AI router and gateway expose no send capability to models', async () => {
    const r = aiRouter({
      db: (await createTestDb()).db,
      gateway: { complete: async () => err({ kind: 'unknown' }) } as never,
    })
    expect(Object.keys(r).sort()).toEqual(['complete', 'routesFor', 'setChain'])
  })
})
