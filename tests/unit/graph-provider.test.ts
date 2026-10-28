import { describe, expect, it } from 'vitest'
import { GraphMailProvider } from '../../server/mail/graph/provider'
import { graphFailure, isGraphUrl } from '../../server/mail/graph/http'
import { mergeBody } from '../../server/mail/graph/drafts'
import { runMailProviderContract, sampleMessage } from '../contract/mail-provider-contract'
import { FakeGraphApi } from '../helpers/fake-graph-api'

const make = () => {
  const fake = new FakeGraphApi()
  return { fake, provider: new GraphMailProvider(fake.api, { accountId: 'acc' }) }
}

runMailProviderContract('graph', async () => {
  const { fake, provider } = make()
  return { provider, seed: async (m) => fake.seed(m), breakNetwork: () => (fake.down = true) }
})

const inbox = { providerId: 'INBOX', name: 'Inbox', role: 'inbox' as const, processed: true }
const draft = (m = sampleMessage('1'), key = 'k', body = 'Hi\nthere') => ({
  accountId: 'acc',
  inReplyTo: m,
  mode: 'reply' as const,
  to: [m.from],
  cc: [],
  subject: 'Re: Q3 numbers',
  bodyText: body,
  idempotencyKey: key,
})

describe('graph', () => {
  it('lists well-known folders and skips a missing archive', async () => {
    const r = await make().provider.listFolders()
    expect(r.ok && r.value.map((f) => f.role)).toEqual([
      'inbox',
      'sent',
      'drafts',
      'trash',
      'spam',
      'other',
    ])
  })

  it('pages through delta and reports removals', async () => {
    const { fake, provider } = make()
    fake.pageSize = 2
    for (const id of ['1', '2', '3']) fake.seed(sampleMessage(id))
    const a = await provider.fetchChanges({ folder: inbox })
    expect(a.ok && a.value.hasMore).toBe(true)
    if (!a.ok) return
    const b = await provider.fetchChanges({ folder: inbox, cursor: a.value.nextCursor })
    expect(b.ok && [b.value.hasMore, b.value.newOrUpdatedIds]).toEqual([false, ['3']])
    if (!b.ok) return
    fake.remove('2')
    const c = await provider.fetchChanges({ folder: inbox, cursor: b.value.nextCursor })
    expect(c.ok && c.value.removedIds).toEqual(['2'])
  })

  it('restarts when the delta token has expired', async () => {
    const { fake, provider } = make()
    fake.seed(sampleMessage('1'))
    const a = await provider.fetchChanges({ folder: inbox })
    if (!a.ok) return
    fake.deltaGone = true
    const b = await provider.fetchChanges({ folder: inbox, cursor: a.value.nextCursor })
    expect(b.ok && b.value.newOrUpdatedIds).toEqual(['1'])
  })

  it('rejects cursors that point outside graph.microsoft.com', async () => {
    const r = await make().provider.fetchChanges({
      folder: inbox,
      cursor: { deltaLink: 'https://evil.test/x' },
    })
    expect(r).toMatchObject({ ok: false, error: { kind: 'validation' } })
    expect(isGraphUrl('https://graph.microsoft.com.evil.test/x')).toBe(false)
  })

  it('maps failures', () => {
    expect(graphFailure({ status: 401, json: {} })).toMatchObject({
      kind: 'auth',
      problem: 'needs_reauth',
    })
    expect(graphFailure({ status: 429, json: {}, retryAfter: 3 })).toEqual({
      kind: 'rate_limited',
      retryAfterSeconds: 3,
    })
    expect(
      graphFailure({ status: 403, json: { error: { code: 'ErrorAccessDenied' } } }),
    ).toMatchObject({ problem: 'admin_consent_required' })
  })
})

describe('graph drafts', () => {
  it('merges our text above the quoted original and replaces it on update', () => {
    const first = mergeBody('<blockquote>q</blockquote>', 'a <b>\nc')
    expect(first).toContain('a &lt;b&gt;<br>c')
    expect(first).toContain('<blockquote>q</blockquote>')
    const second = mergeBody(first, 'new')
    expect(second.match(/data-sentinel-reply/g)).toHaveLength(1)
    expect(second).toContain('new')
    expect(second).toContain('<blockquote>q</blockquote>')
  })

  it('creates one draft per key, even when retried', async () => {
    const { fake, provider } = make()
    fake.seed(sampleMessage('1'))
    await provider.createReplyDraft(draft())
    await provider.createReplyDraft(draft(undefined, 'k', 'edited'))
    expect(fake.drafts).toHaveLength(1)
    expect(fake.drafts[0]!.content).toContain('edited')
    expect(fake.drafts[0]!.content).toContain('blockquote')
  })

  it('refuses to touch messages that are not Sentinel drafts', async () => {
    const { fake, provider } = make()
    fake.drafts.push({ id: 'USER', categories: [], content: 'mine' })
    const ref = {
      accountId: 'acc',
      providerDraftId: 'USER',
      providerMessageId: null,
      createdAt: new Date(),
    }
    expect(await provider.updateDraft(ref, draft())).toMatchObject({
      ok: false,
      error: { kind: 'forbidden' },
    })
    expect((await provider.deleteDraft(ref)).ok).toBe(false)
    expect(fake.drafts).toHaveLength(1)
  })

  it('never calls a send endpoint', async () => {
    const { fake, provider } = make()
    fake.seed(sampleMessage('1'))
    const c = await provider.createReplyDraft(draft())
    if (c.ok) await provider.deleteDraft(c.value)
    expect(fake.calls.some((x) => /send/i.test(x))).toBe(false)
  })
})
