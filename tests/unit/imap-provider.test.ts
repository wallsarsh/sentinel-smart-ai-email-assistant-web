import { describe, expect, it } from 'vitest'
import { ImapMailProvider, roleOf } from '../../server/mail/imap/provider'
import { buildReply } from '../../server/mail/mime/reply-builder'
import type { MailMessage } from '../../shared/domain'
import { runMailProviderContract, sampleMessage } from '../contract/mail-provider-contract'
import { FakeImapSession } from '../helpers/fake-imap-session'

const rawOf = (m: MailMessage) => {
  const addr = (a: { address: string; name?: string }) =>
    a.name ? `${a.name} <${a.address}>` : a.address
  return [
    `From: ${addr(m.from)}`,
    `To: ${m.to.map(addr).join(', ')}`,
    `Subject: ${m.subject}`,
    `Message-ID: ${m.internetMessageId}`,
    `Date: ${m.sentAt.toUTCString()}`,
    ...(m.references.length ? [`References: ${m.references.join(' ')}`] : []),
    'Content-Type: text/plain; charset=utf-8',
    '',
    m.bodyText,
    '',
  ].join('\r\n')
}

export const make = () => {
  const fake = new FakeImapSession()
  const provider = new ImapMailProvider(fake, { accountEmail: 'me@x.test', accountId: 'acc' })
  const seed = (m: MailMessage, flags: string[] = []) => {
    // Thread ids come from References: use the logical thread as the root id.
    const withRoot = { ...m, references: [`<thread-${m.providerThreadId}@x.test>`] }
    return fake.add('INBOX', rawOf(withRoot), flags, m.receivedAt)
  }
  return { fake, provider, seed }
}

runMailProviderContract('imap', async () => {
  const { fake, provider, seed } = make()
  return {
    provider,
    seed: async (m) => void seed(m),
    breakNetwork: () => (fake.down = true),
    idFor: (l) => `INBOX:1:${l}`,
    threadFor: (l) => `<thread-${l}@x.test>`,
  }
})

const inbox = { providerId: 'INBOX', name: 'INBOX', role: 'inbox' as const, processed: true }
const draft = (key = 'k', body = 'Hi') => ({
  accountId: 'acc',
  inReplyTo: sampleMessage('1'),
  mode: 'reply' as const,
  to: [{ address: 'alex@acme.example' }],
  cc: [],
  subject: 'Re: Q3 numbers',
  bodyText: body,
  idempotencyKey: key,
})

describe('imap provider', () => {
  it('detects special-use and named folders', () => {
    expect(roleOf({ path: 'INBOX', name: 'INBOX' })).toBe('inbox')
    expect(roleOf({ path: 'X', name: 'X', specialUse: '\\Junk' })).toBe('spam')
    expect(roleOf({ path: 'Gesendet', name: 'Gesendet' })).toBe('sent')
    expect(roleOf({ path: 'Misc', name: 'Misc' })).toBe('other')
  })

  it('never changes flags: read-only open and PEEK fetch', async () => {
    const { fake, provider, seed } = make()
    seed(sampleMessage('1'))
    const c = await provider.fetchChanges({ folder: inbox })
    if (!c.ok) throw new Error('x')
    const r = await provider.getMessages(c.value.newOrUpdatedIds)
    expect(r.ok && r.value[0]!.isRead).toBe(false)
    expect(fake.box('INBOX').msgs[0]!.flags).not.toContain('\\Seen')
    expect(fake.log.every((l) => !/STORE|SEEN/i.test(l))).toBe(true)
    expect(fake.log).toContain('FETCH BODY.PEEK[]')
  })

  it('parses a message', async () => {
    const { provider, seed } = make()
    seed(
      sampleMessage('1', 't', { subject: 'Hello', from: { address: 'a@b.test', name: 'Ann' } }),
      ['\\Seen'],
    )
    const r = await provider.getMessages(['INBOX:1:1'])
    expect(r.ok && r.value[0]).toMatchObject({
      subject: 'Hello',
      isRead: true,
      from: { address: 'a@b.test', name: 'Ann' },
    })
  })

  it('resyncs from scratch when UIDVALIDITY changes', async () => {
    const { fake, provider, seed } = make()
    seed(sampleMessage('1'))
    const a = await provider.fetchChanges({ folder: inbox })
    if (!a.ok) throw new Error('x')
    fake.box('INBOX').uidValidity = 2
    const b = await provider.fetchChanges({ folder: inbox, cursor: a.value.nextCursor })
    expect(b.ok && b.value.newOrUpdatedIds).toEqual(['INBOX:2:1'])
    expect(b.ok && b.value.nextCursor).toMatchObject({ uidValidity: 2 })
    // Ids from the old validity no longer resolve.
    expect(await provider.getMessages(['INBOX:1:1'])).toEqual({ ok: true, value: [] })
  })

  it('pages large folders', async () => {
    const { provider, seed } = make()
    for (let i = 1; i <= 5; i++) seed(sampleMessage(String(i)))
    const a = await provider.fetchChanges({ folder: inbox, maxMessages: 3 })
    expect(a.ok && [a.value.newOrUpdatedIds.length, a.value.hasMore]).toEqual([3, true])
    if (!a.ok) return
    const b = await provider.fetchChanges({
      folder: inbox,
      maxMessages: 3,
      cursor: a.value.nextCursor,
    })
    expect(b.ok && [b.value.newOrUpdatedIds.length, b.value.hasMore]).toEqual([2, false])
  })

  it('maps authentication errors', async () => {
    const { fake, provider } = make()
    fake.list = async () => {
      throw Object.assign(new Error('x'), { authenticationFailed: true })
    }
    expect(await provider.listFolders()).toEqual({
      ok: false,
      error: { kind: 'auth', problem: 'invalid_credentials' },
    })
  })
})

describe('imap drafts', () => {
  it('appends with \\Draft and keeps one draft per key across updates', async () => {
    const { fake, provider } = make()
    const a = await provider.createReplyDraft(draft('k'))
    const retry = await provider.createReplyDraft(draft('k'))
    expect(retry.ok && a.ok && retry.value.providerDraftId).toBe(a.ok && a.value.providerDraftId)
    const b = a.ok ? await provider.updateDraft(a.value, draft('k', 'edited')) : a
    expect(fake.log.some((l) => l === 'APPEND Drafts \\Draft \\Seen')).toBe(true)
    expect(fake.box('Drafts').msgs).toHaveLength(1)
    expect(fake.box('Drafts').msgs[0]!.source.toString()).toContain('edited')
    expect(a.ok && b.ok && b.value.providerMessageId).toBe('<sentinel-k@x.test>')
    if (b.ok) {
      expect((await provider.deleteDraft(b.value)).ok).toBe(true)
      expect(fake.box('Drafts').msgs).toHaveLength(0)
    }
  })

  it('does not delete messages that are not ours', async () => {
    const { fake, provider } = make()
    const built = buildReply({
      original: sampleMessage('1'),
      from: { address: 'me@x.test' },
      to: [{ address: 'a@b.test' }],
      cc: [],
      bodyText: 'mine',
      messageId: '<user-draft@x.test>',
    })
    const uid = fake.add('Drafts', built.raw, ['\\Draft'])
    const ref = {
      accountId: 'acc',
      providerDraftId: `Drafts:1:${uid}`,
      providerMessageId: '<user-draft@x.test>',
      createdAt: new Date(),
    }
    expect(await provider.deleteDraft(ref)).toMatchObject({
      ok: false,
      error: { kind: 'forbidden' },
    })
    expect(fake.box('Drafts').msgs).toHaveLength(1)
  })

  it('deleting a missing draft succeeds', async () => {
    const { provider } = make()
    const ref = {
      accountId: 'acc',
      providerDraftId: 'Drafts:1:99',
      providerMessageId: null,
      createdAt: new Date(),
    }
    expect((await provider.deleteDraft(ref)).ok).toBe(true)
  })

  it('fails clearly when there is no Drafts folder', async () => {
    const { fake, provider } = make()
    fake.folders = [{ path: 'INBOX', name: 'INBOX' }]
    expect(await provider.createReplyDraft(draft())).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    })
  })
})
