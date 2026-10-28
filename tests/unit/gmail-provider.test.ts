import { describe, expect, it } from 'vitest'
import { GmailMailProvider } from '../../server/mail/gmail/provider'
import { failureFor } from '../../server/mail/gmail/http'
import { parseAddresses } from '../../server/mail/gmail/parse'
import { runMailProviderContract, sampleMessage } from '../contract/mail-provider-contract'
import { FakeGmailApi } from '../helpers/fake-gmail-api'

export const makeGmail = () => {
  const fake = new FakeGmailApi()
  const provider = new GmailMailProvider(fake.api, { accountEmail: 'me@x.test', accountId: 'acc' })
  return { fake, provider }
}

runMailProviderContract('gmail', async () => {
  const { fake, provider } = makeGmail()
  return {
    provider,
    seed: async (m) => fake.seed(m),
    breakNetwork: () => (fake.down = true),
  }
})

const inbox = { providerId: 'INBOX', name: 'Inbox', role: 'inbox' as const, processed: true }

describe('gmail sync', () => {
  it('maps system labels to roles', async () => {
    const r = await makeGmail().provider.listFolders()
    expect(r.ok && r.value.map((f) => f.role)).toEqual(['inbox', 'sent', 'drafts', 'other'])
  })

  it('reports removed messages from history', async () => {
    const { fake, provider } = makeGmail()
    fake.seed(sampleMessage('1'))
    const first = await provider.fetchChanges({ folder: inbox })
    if (!first.ok) throw new Error('x')
    fake.seed(sampleMessage('2'))
    fake.remove('1')
    const next = await provider.fetchChanges({ folder: inbox, cursor: first.value.nextCursor })
    expect(next.ok && next.value.removedIds).toEqual(['1'])
    expect(next.ok && next.value.newOrUpdatedIds).toEqual(['2'])
  })

  it('does a full resync when history has expired', async () => {
    const { fake, provider } = makeGmail()
    fake.seed(sampleMessage('1'))
    const first = await provider.fetchChanges({ folder: inbox })
    if (!first.ok) throw new Error('x')
    fake.expireHistory = true
    const next = await provider.fetchChanges({ folder: inbox, cursor: first.value.nextCursor })
    expect(next.ok && next.value.newOrUpdatedIds).toEqual(['1'])
  })

  it('parses bodies, attachments, read state and encoded names', async () => {
    const { fake, provider } = makeGmail()
    fake.seed(
      sampleMessage('1', 't', {
        attachmentNames: ['a.pdf'],
        from: { address: 'a@b.test', name: '=?UTF-8?B?w5xiZXI=?=' },
      }),
      ['INBOX'],
    )
    const r = await provider.getMessages(['1', 'missing'])
    if (!r.ok) throw new Error('x')
    expect(r.value).toHaveLength(1)
    expect(r.value[0]).toMatchObject({
      isRead: true,
      attachmentNames: ['a.pdf'],
      bodyText: 'Please send the numbers.',
    })
    expect(r.value[0]!.from.name).toBe('Über')
  })
})

describe('gmail errors and addresses', () => {
  it('maps statuses to failures', () => {
    expect(failureFor({ status: 401, json: {} })).toMatchObject({ kind: 'auth' })
    expect(failureFor({ status: 429, json: {}, retryAfter: 7 })).toEqual({
      kind: 'rate_limited',
      retryAfterSeconds: 7,
    })
    expect(failureFor({ status: 503, json: {} })).toMatchObject({ kind: 'provider', status: 503 })
    expect(
      failureFor({ status: 403, json: { error: { errors: [{ reason: 'rateLimitExceeded' }] } } })
        .kind,
    ).toBe('rate_limited')
  })
  it('parses address lists', () => {
    expect(parseAddresses('"Doe, J" <j@x.test>, k@y.test')).toEqual([
      { address: 'j@x.test', name: 'Doe, J' },
      { address: 'k@y.test' },
    ])
  })
})

describe('gmail drafts', () => {
  const m = sampleMessage('1', 'thr-1')
  const d = (key = 'k', body = 'Hi') => ({
    accountId: 'acc',
    inReplyTo: m,
    mode: 'reply' as const,
    to: [m.from],
    cc: [],
    subject: 'Re: Q3 numbers',
    bodyText: body,
    idempotencyKey: key,
  })

  it('retries create without duplicating, keeping the thread and threading headers', async () => {
    const { fake, provider } = makeGmail()
    await provider.createReplyDraft(d('k'))
    await provider.createReplyDraft(d('k', 'edited'))
    expect(fake.drafts).toHaveLength(1)
    expect(fake.drafts[0]!.threadId).toBe('thr-1')
    expect(fake.drafts[0]!.raw).toContain('In-Reply-To: <1@x.test>')
    expect(fake.drafts[0]!.raw).toContain('Message-ID: <sentinel-k@x.test>')
  })

  it('never updates or deletes a draft it did not create', async () => {
    const { fake, provider } = makeGmail()
    fake.drafts.push({ id: 'theirs', messageId: '<user-written@gmail.com>', raw: '' })
    const ref = {
      accountId: 'acc',
      providerDraftId: 'theirs',
      providerMessageId: null,
      createdAt: new Date(),
    }
    const u = await provider.updateDraft(ref, d())
    expect(u).toEqual({ ok: false, error: { kind: 'forbidden', code: 'not_sentinel_draft' } })
    expect((await provider.deleteDraft(ref)).ok).toBe(false)
    expect(fake.drafts).toHaveLength(1)
  })

  it('never calls anything that sends', async () => {
    const { fake, provider } = makeGmail()
    const c = await provider.createReplyDraft(d())
    if (c.ok) await provider.deleteDraft(c.value)
    expect(fake.calls.some((x) => /send/i.test(x))).toBe(false)
  })
})
