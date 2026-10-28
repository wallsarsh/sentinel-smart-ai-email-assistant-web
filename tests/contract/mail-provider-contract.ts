import { beforeEach, describe, expect, it } from 'vitest'
import type { MailMessage } from '../../shared/domain'
import {
  FORBIDDEN_PROVIDER_METHODS,
  type MailProvider,
  type ReplyDraft,
} from '../../server/mail/provider'

export type ContractHarness = {
  provider: MailProvider
  /** Adds a message to the backing mailbox (test double or fixture server). */
  seed(m: MailMessage): Promise<void>
  /** Makes the next call fail with a network error. */
  breakNetwork(): void
  /** Providers whose ids/threads are derived (IMAP) map the logical ids used below. */
  idFor?(logical: string): string
  threadFor?(logical: string): string
}

export const sampleMessage = (
  id: string,
  thread = 't1',
  over: Partial<MailMessage> = {},
): MailMessage => ({
  providerMessageId: id,
  providerThreadId: thread,
  internetMessageId: `<${id}@x.test>`,
  from: { address: 'alex@acme.example', name: 'Alex' },
  to: [{ address: 'me@x.test' }],
  cc: [],
  subject: 'Q3 numbers',
  sentAt: new Date('2026-10-27T09:00:00Z'),
  receivedAt: new Date('2026-10-27T09:00:00Z'),
  isRead: false,
  bodyText: 'Please send the numbers.',
  bodyHtml: null,
  attachmentNames: [],
  references: [],
  listUnsubscribe: null,
  precedence: null,
  autoSubmitted: null,
  ...over,
})

/**
 * Behaviour every MailProvider must have. Run it against each provider's
 * fixture-backed harness: `runMailProviderContract('gmail', () => harness())`.
 */
export function runMailProviderContract(name: string, make: () => Promise<ContractHarness>) {
  describe(`MailProvider contract: ${name}`, () => {
    let h: ContractHarness
    const id = (x: string) => h.idFor?.(x) ?? x
    const thr = (x: string) => h.threadFor?.(x) ?? x
    beforeEach(async () => {
      h = await make()
    })

    const draftFor = (m: MailMessage, key = 'k1', body = 'Thanks!'): ReplyDraft => ({
      accountId: 'acc',
      inReplyTo: m,
      mode: 'reply',
      to: [m.from],
      cc: [],
      subject: `Re: ${m.subject}`,
      bodyText: body,
      idempotencyKey: key,
    })

    it('has no way to send mail', () => {
      const names = new Set<string>()
      for (
        let o: object | null = h.provider;
        o && o !== Object.prototype;
        o = Object.getPrototypeOf(o)
      )
        Object.getOwnPropertyNames(o).forEach((n) => names.add(n))
      for (const bad of FORBIDDEN_PROVIDER_METHODS) expect(names.has(bad), bad).toBe(false)
    })

    it('lists an inbox folder', async () => {
      const r = await h.provider.listFolders()
      expect(r.ok && r.value.some((f) => f.role === 'inbox')).toBe(true)
    })

    it('syncs incrementally: first page, then nothing new, then only the new message', async () => {
      await h.seed(sampleMessage('1'))
      await h.seed(sampleMessage('2'))
      const folder = { providerId: 'INBOX', name: 'Inbox', role: 'inbox' as const, processed: true }
      const first = await h.provider.fetchChanges({ folder })
      expect(first.ok).toBe(true)
      if (!first.ok) return
      expect(first.value.newOrUpdatedIds.sort()).toEqual([id('1'), id('2')])
      const again = await h.provider.fetchChanges({ folder, cursor: first.value.nextCursor })
      expect(again.ok && again.value.newOrUpdatedIds).toEqual([])
      await h.seed(sampleMessage('3'))
      const next = await h.provider.fetchChanges({ folder, cursor: first.value.nextCursor })
      expect(next.ok && next.value.newOrUpdatedIds).toEqual([id('3')])
    })

    it('fetches messages by id and by thread', async () => {
      await h.seed(sampleMessage('1', 'tA'))
      await h.seed(sampleMessage('2', 'tA'))
      const r = await h.provider.getMessages([id('1')])
      expect(r.ok && r.value.map((m) => m.providerMessageId)).toEqual([id('1')])
      const t = await h.provider.getThread(thr('tA'))
      expect(t.ok && t.value).toHaveLength(2)
    })

    it('creating the same draft twice yields one draft (idempotency)', async () => {
      const m = sampleMessage('1')
      const a = await h.provider.createReplyDraft(draftFor(m, 'same'))
      const b = await h.provider.createReplyDraft(draftFor(m, 'same', 'edited'))
      expect(a.ok && b.ok).toBe(true)
      if (a.ok && b.ok) expect(b.value.providerDraftId).toBe(a.value.providerDraftId)
    })

    it('updates and deletes only drafts it made; deleting twice is fine', async () => {
      const m = sampleMessage('1')
      const c = await h.provider.createReplyDraft(draftFor(m))
      expect(c.ok).toBe(true)
      if (!c.ok) return
      expect((await h.provider.updateDraft(c.value, draftFor(m, 'k1', 'new text'))).ok).toBe(true)
      expect((await h.provider.deleteDraft(c.value)).ok).toBe(true)
      expect((await h.provider.deleteDraft(c.value)).ok).toBe(true)
    })

    it('offers an https link or none', async () => {
      const c = await h.provider.createReplyDraft(draftFor(sampleMessage('1')))
      if (!c.ok) throw new Error('draft')
      const link = h.provider.nativeLink(c.value)
      expect(link === null || link.startsWith('https://')).toBe(true)
    })

    it('reports network trouble as a failure, not an exception', async () => {
      h.breakNetwork()
      const r = await h.provider.listFolders()
      expect(r.ok).toBe(false)
      if (!r.ok) expect(['network', 'provider', 'auth']).toContain(r.error.kind)
    })

    it('can be closed', async () => {
      await expect(h.provider.close()).resolves.toBeUndefined()
    })
  })
}
