import { describe, expect, it } from 'vitest'
import { gmailSender } from '../../server/mail/send/gmail'
import { FakeGmailApi } from '../helpers/fake-gmail-api'
import { sendFixture } from './helpers'

async function setup() {
  const f = await sendFixture('gmail')
  const api = new FakeGmailApi()
  api.drafts.push({
    id: 'd1',
    messageId: '<sentinel-k@x.test>',
    raw: 'old body',
    threadId: 'thr-1',
  })
  const sender = gmailSender({ db: f.db, apiFor: () => api.api })
  const posts = () => api.calls.filter((c) => c === 'POST /drafts/send')
  return { ...f, api, sender, posts }
}

describe('GmailMailSender (recording network)', () => {
  it('updates the draft with the approved content, then submits exactly once', async () => {
    const s = await setup()
    const res = await s.sender.send(await s.redeem())
    if (!res.ok) throw new Error(JSON.stringify(res.error))
    expect(s.api.calls.filter((c) => /^(PUT|POST|GET) \/drafts/.test(c))).toEqual([
      'GET /drafts/d1',
      'PUT /drafts/d1',
      'POST /drafts/send',
    ])
    expect(s.posts()).toHaveLength(1)
    const raw = s.api.sent[0]!.raw
    expect(raw).toContain('Subject: Re: Q3 numbers')
    expect(raw).toContain('Thanks, I will send them by 3pm.')
    expect(raw).toContain('In-Reply-To: <orig@acme.example>')
    expect(raw).toContain(`Message-ID: ${res.value.internetMessageId}`)
    expect(s.api.sent[0]!.threadId).toBe('thr-1')
    const rec = (await s.repos.send.getRecord(res.value.sendRecordId))!
    expect(rec).toMatchObject({
      status: 'sent',
      internetMessageId: res.value.internetMessageId,
      recipientCount: 1,
    })
    expect(JSON.stringify(rec)).not.toContain('Thanks')
  })

  it('a second attempt with the same proof is refused before any network call', async () => {
    const s = await setup()
    const proof = await s.redeem()
    await s.sender.send(proof)
    const before = s.api.calls.length
    expect(await s.sender.send(proof)).toEqual({
      ok: false,
      error: { kind: 'send_refused', reason: 'already_used' },
    })
    expect(s.api.calls.length).toBe(before)
  })

  it('failure before submit: nothing is sent and the record is failed', async () => {
    const s = await setup()
    const gone = await s.sender.send(
      await (async () => {
        s.api.drafts.length = 0
        return s.redeem()
      })(),
    )
    expect(gone).toMatchObject({ ok: false, error: { kind: 'not_found' } })
    expect(s.posts()).toHaveLength(0)
    expect((await s.repos.send.recentRecords())[0]).toMatchObject({ status: 'failed' })
  })

  it('a 4xx from drafts.send is failed (not accepted), without retry', async () => {
    const s = await setup()
    s.api.sendStatus = 400
    const res = await s.sender.send(await s.redeem())
    expect(res).toMatchObject({ ok: false, error: { kind: 'provider', status: 400 } })
    expect(s.posts()).toHaveLength(1)
    expect((await s.repos.send.recentRecords())[0]!.status).toBe('failed')
  })

  it('a 5xx or a dropped connection is unknown, never retried', async () => {
    for (const mode of [{ status: 503 }, { throws: 'ECONNRESET' }]) {
      const s = await setup()
      if ('status' in mode) s.api.sendStatus = mode.status
      else s.api.sendThrows = mode.throws
      const res = await s.sender.send(await s.redeem())
      expect(res).toEqual({
        ok: false,
        error: { kind: 'provider', status: null, code: 'send_unknown' },
      })
      expect(s.posts()).toHaveLength(1)
      expect((await s.repos.send.recentRecords())[0]!.status).toBe('unknown')
    }
  })

  it('a refused connection before anything was written is failed, not unknown', async () => {
    const s = await setup()
    s.api.sendThrows = 'ECONNREFUSED'
    const res = await s.sender.send(await s.redeem())
    expect(res).toMatchObject({ ok: false, error: { kind: 'network' } })
    expect((await s.repos.send.recentRecords())[0]!.status).toBe('failed')
  })

  it('a revoked token (401) on submit asks for reconnect and is failed', async () => {
    const s = await setup()
    s.api.sendStatus = 401
    expect(await s.sender.send(await s.redeem())).toMatchObject({
      ok: false,
      error: { kind: 'auth', problem: 'needs_reauth' },
    })
  })

  it('reconcile finds an unknown send in Sent and marks it sent without ever submitting again', async () => {
    const s = await setup()
    s.api.sendStatus = 503
    const res = await s.sender.send(await s.redeem())
    expect(res.ok).toBe(false)
    const rec = (await s.repos.send.recentRecords())[0]!
    expect(await s.sender.reconcile(s.user.id, rec.id)).toEqual({ ok: true, value: false }) // not in Sent: still unknown
    expect((await s.repos.send.getRecord(rec.id))!.status).toBe('unknown')
    // The message did arrive after all:
    s.api.seed(
      {
        providerMessageId: 'x',
        providerThreadId: null,
        internetMessageId: rec.internetMessageId,
        from: { address: 'me@x.test' },
        to: [],
        cc: [],
        subject: '',
        sentAt: new Date(),
        receivedAt: new Date(),
        isRead: true,
        bodyText: '',
        bodyHtml: null,
        attachmentNames: [],
        references: [],
        listUnsubscribe: null,
        precedence: null,
        autoSubmitted: null,
      },
      ['SENT'],
    )
    expect(await s.sender.reconcile(s.user.id, rec.id)).toEqual({ ok: true, value: true })
    expect((await s.repos.send.getRecord(rec.id))!.status).toBe('sent')
    expect(s.posts()).toHaveLength(1)
  })
})
