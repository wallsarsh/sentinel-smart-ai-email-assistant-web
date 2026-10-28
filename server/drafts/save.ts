import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Db } from '../db/client'
import { forUser } from '../repos'
import { rowToMailMessage } from '../sync/message-mapper'
import { replySubject } from '../mail/mime/reply-builder'
import type { MailProvider } from '../mail/provider'
import { draftIntent, draftTone } from '../../shared/domain'
import type { AppFailure } from '../../shared/errors/failure'
import { err, ok, type Result } from '../../shared/errors/result'

/** The user's text plus their signature (once). The signature is added by the app, never written by the AI. */
export function withSignature(body: string, signature: string): string {
  const b = body.trimEnd()
  const sig = signature.trim()
  if (!sig || b.endsWith(sig)) return b
  return `${b}\n\n${sig}`
}

const input = z.object({
  body: z.string().max(100_000),
  to: z.array(z.email()).max(50),
  cc: z.array(z.email()).max(50).default([]),
  tone: draftTone.default('professional'),
  intent: draftIntent.default('custom'),
  replyAll: z.boolean().default(false),
})

export type SavedDraft = {
  id: string
  status: 'saved'
  providerDraftId: string
  nativeLink: string | null
}

/**
 * Saves the user's reply as a draft at the mail provider. It can only create or
 * change drafts (the provider has no send method). The local row and its
 * idempotency key are written first, and saving the same message again updates
 * the same draft, so a retry after a timeout never creates a duplicate.
 */
export function draftSaver(d: {
  db: Db
  providerFor(userId: string, accountId: string): Promise<MailProvider>
  newId?: () => string
}) {
  const newId = d.newId ?? randomUUID
  return {
    async save(
      userId: string,
      messageId: string,
      raw: unknown,
    ): Promise<Result<SavedDraft, AppFailure>> {
      const p = input.safeParse(raw)
      if (!p.success)
        return err({
          kind: 'validation',
          field: String(p.error.issues[0]?.path[0] ?? ''),
          code: 'invalid',
        })
      if (!p.data.to.length) return err({ kind: 'validation', field: 'to', code: 'no_recipients' })
      const repos = forUser(d.db, userId)
      const row = await repos.mail.getMessage(messageId)
      const account = row ? await repos.accounts.get(row.accountId) : null
      if (!row || !account) return err({ kind: 'not_found' })

      const thread = row.threadId
        ? (await repos.mail.threadMessages(row.threadId)).find((t) => t.id === row.id)
        : row
      const original = rowToMailMessage(
        thread ?? row,
        row.threadId ? await threadProviderId(repos, row.threadId) : null,
      )
      const text = withSignature(
        p.data.body,
        (await repos.settings.get('profile.signature')) as string,
      )

      const existing = await repos.drafts.forMessage(messageId)
      const key = existing?.idempotencyKey ?? newId()
      const now = new Date()
      const local = await repos.drafts.upsert({
        id: existing?.id ?? newId(),
        messageId,
        accountId: account.id,
        idempotencyKey: key,
        tone: p.data.tone,
        intent: p.data.intent,
        status: existing?.status ?? 'local',
        bodyPreview: text.slice(0, 160),
        providerDraftId: existing?.providerDraftId ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })

      let provider: MailProvider
      try {
        provider = await d.providerFor(userId, account.id)
      } catch {
        return err({ kind: 'auth', problem: 'needs_reauth' })
      }
      try {
        const draft = {
          accountId: account.id,
          inReplyTo: original,
          mode: p.data.replyAll ? ('reply_all' as const) : ('reply' as const),
          to: p.data.to.map((address) => ({ address })),
          cc: p.data.cc.map((address) => ({ address })),
          subject: replySubject(original.subject),
          bodyText: text,
          idempotencyKey: key,
        }
        const r = existing?.providerDraftId
          ? await provider.updateDraft(
              {
                accountId: account.id,
                providerDraftId: existing.providerDraftId,
                providerMessageId: existing.providerDraftId,
                createdAt: existing.createdAt,
              },
              draft,
            )
          : await provider.createReplyDraft(draft)
        if (!r.ok) return r // the local row and key stay, so a retry updates rather than duplicates
        await repos.drafts.setStatus(local.id, 'saved', r.value.providerDraftId)
        return ok({
          id: local.id,
          status: 'saved',
          providerDraftId: r.value.providerDraftId,
          nativeLink: provider.nativeLink(r.value),
        })
      } finally {
        await provider.close().catch(() => undefined)
      }
    },

    /** Removes our draft at the provider (only drafts Sentinel made) and forgets it locally. Missing drafts count as removed. */
    async discard(userId: string, messageId: string): Promise<Result<undefined, AppFailure>> {
      const repos = forUser(d.db, userId)
      const existing = await repos.drafts.forMessage(messageId)
      if (!existing) return ok(undefined)
      if (existing.providerDraftId) {
        let provider: MailProvider
        try {
          provider = await d.providerFor(userId, existing.accountId)
        } catch {
          return err({ kind: 'auth', problem: 'needs_reauth' })
        }
        try {
          const r = await provider.deleteDraft({
            accountId: existing.accountId,
            providerDraftId: existing.providerDraftId,
            providerMessageId: existing.providerDraftId,
            createdAt: existing.createdAt,
          })
          if (!r.ok) return r
        } finally {
          await provider.close().catch(() => undefined)
        }
      }
      await repos.drafts.setStatus(existing.id, 'deleted')
      return ok(undefined)
    },
  }
}

async function threadProviderId(
  repos: ReturnType<typeof forUser>,
  threadId: string,
): Promise<string | null> {
  return (await repos.mail.threadProviderId(threadId)) ?? null
}
