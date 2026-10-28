import { describe, expect, it } from 'vitest'
import { graphSender } from '../../server/mail/send/graph'
import { FakeGraphApi } from '../helpers/fake-graph-api'
import { sendFixture } from './helpers'

async function setup() {
  const f = await sendFixture('microsoft_graph', {
    draftRef: { providerDraftId: 'D1', providerMessageId: 'D1' },
  })
  const api = new FakeGraphApi()
  api.drafts.push({
    id: 'D1',
    categories: ['sentinel-k'],
    content: '<blockquote>original</blockquote>',
  })
  const sender = graphSender({ db: f.db, apiFor: () => api.api })
  const sends = () => api.calls.filter((c) => /^POST \/messages\/.+\/send$/.test(c))
  return { ...f, api, sender, sends }
}

describe('GraphMailSender (recording network)', () => {
  it('patches the draft with the approved content, keeps the quoted original, and sends once', async () => {
    const s = await setup()
    const res = await s.sender.send(await s.redeem())
    if (!res.ok) throw new Error(JSON.stringify(res.error))
    expect(s.api.calls.filter((c) => /D1/.test(c))).toEqual([
      'GET /messages/D1',
      'PATCH /messages/D1',
      'POST /messages/D1/send',
    ])
    expect(s.sends()).toHaveLength(1)
    expect(s.api.sent[0]!.content).toContain('Thanks, I will send them by 3pm.')
    expect(s.api.sent[0]!.content).toContain('<blockquote>original</blockquote>')
    expect(s.api.sent[0]!.subject).toBe('Re: Q3 numbers')
    expect(res.value.internetMessageId).toBe('<graph-D1@x.test>')
    expect((await s.repos.send.getRecord(res.value.sendRecordId))!).toMatchObject({
      status: 'sent',
      recipientCount: 1,
    })
  })

  it('single-use proof; missing draft sends nothing', async () => {
    const s = await setup()
    const proof = await s.redeem()
    await s.sender.send(proof)
    const n = s.api.calls.length
    expect(await s.sender.send(proof)).toEqual({
      ok: false,
      error: { kind: 'send_refused', reason: 'already_used' },
    })
    expect(s.api.calls.length).toBe(n)
    const gone = await setup()
    gone.api.drafts.length = 0
    expect(await gone.sender.send(await gone.redeem())).toMatchObject({
      ok: false,
      error: { kind: 'not_found' },
    })
    expect(gone.sends()).toHaveLength(0)
    expect((await gone.repos.send.recentRecords())[0]!.status).toBe('failed')
  })

  it.each([
    ['4xx → failed', { sendStatus: 400 }, 'failed'],
    ['403 → failed', { sendStatus: 403 }, 'failed'],
    ['5xx → unknown', { sendStatus: 503 }, 'unknown'],
    ['reset → unknown', { sendThrows: 'ECONNRESET' }, 'unknown'],
    ['timeout → unknown', { sendThrows: 'ETIMEDOUT' }, 'unknown'],
    ['refused → failed', { sendThrows: 'ECONNREFUSED' }, 'failed'],
  ])('submit outcome %s, one attempt only', async (_n, set, want) => {
    const s = await setup()
    Object.assign(s.api, set)
    const res = await s.sender.send(await s.redeem())
    expect(res.ok).toBe(false)
    expect(s.sends()).toHaveLength(1)
    expect((await s.repos.send.recentRecords())[0]!.status).toBe(want)
  })

  it('reconcile looks in Sent Items by Message-ID and never submits again', async () => {
    const s = await setup()
    s.api.sendStatus = 503
    await s.sender.send(await s.redeem())
    const rec = (await s.repos.send.recentRecords())[0]!
    expect(await s.sender.reconcile(s.user.id, rec.id)).toEqual({ ok: true, value: false })
    s.api.sentItems.push(rec.internetMessageId)
    expect(await s.sender.reconcile(s.user.id, rec.id)).toEqual({ ok: true, value: true })
    expect((await s.repos.send.getRecord(rec.id))!.status).toBe('sent')
    expect(s.sends()).toHaveLength(1)
  })
})
