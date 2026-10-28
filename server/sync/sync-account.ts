import type { Db } from '../db/client'
import { forUser } from '../repos'
import type { MailFolder, MailMessage } from '../../shared/domain'
import type { AppFailure } from '../../shared/errors/failure'
import { sanitizeHtml } from '../mail/sanitize'
import type { MailProvider } from '../mail/provider'

export type SyncOptions = {
  db: Db
  userId: string
  accountId: string
  provider: MailProvider
  /** First sync window. */
  initialDays?: number
  pageSize?: number
  now?: () => Date
  /** Called after each committed page with ids only. */
  onPage?: (p: { folderId: string; added: string[]; removed: number }) => void
  /** Test hook: throw here to simulate a crash between fetch and commit. */
  beforeCommit?: () => void
}

export type SyncResult =
  { ok: true; added: number; removed: number } | { ok: false; error: AppFailure; added: number }

type CursorState = { folders?: Record<string, Record<string, unknown>> }
const inFlight = new Set<string>()

const snippetOf = (m: MailMessage) => m.bodyText.replace(/\s+/g, ' ').trim().slice(0, 200)

/**
 * Syncs one account: every folder marked processed, page by page. A page's
 * messages, deletions and the new cursor are written in one transaction, so a
 * crash replays the page (upserts are idempotent) and never skips it. Only one
 * sync per account runs at a time; a second call returns immediately.
 */
export async function syncAccount(o: SyncOptions): Promise<SyncResult> {
  const key = `${o.userId}:${o.accountId}`
  if (inFlight.has(key)) return { ok: true, added: 0, removed: 0 }
  inFlight.add(key)
  try {
    return await run(o)
  } finally {
    inFlight.delete(key)
  }
}

async function run(o: SyncOptions): Promise<SyncResult> {
  const now = o.now ?? (() => new Date())
  const repos = forUser(o.db, o.userId)
  const account = await repos.accounts.get(o.accountId)
  if (!account) return { ok: false, error: { kind: 'not_found' }, added: 0 }
  let added = 0
  let removed = 0

  const listed = await o.provider.listFolders()
  if (!listed.ok) return { ok: false, error: listed.error, added }
  await repos.mail.upsertFolders(
    o.accountId,
    listed.value.map((f) => ({
      providerId: f.providerId,
      name: f.name,
      role: f.role,
      processed: f.processed,
    })),
  )
  const rows = (await repos.mail.listFolders(o.accountId)).filter((f) => f.processed)
  const byProvider = new Map<string, MailFolder>(listed.value.map((f) => [f.providerId, f]))

  for (const row of rows) {
    const folder = byProvider.get(row.providerId) ?? {
      providerId: row.providerId,
      name: row.name,
      role: row.role,
      processed: true,
    }
    for (;;) {
      const state = ((await repos.accounts.get(o.accountId))?.syncCursor ?? {}) as CursorState
      const cursor = state.folders?.[row.providerId]
      const since = cursor
        ? undefined
        : new Date(now().getTime() - (o.initialDays ?? 14) * 86_400_000)
      const changes = await o.provider.fetchChanges({
        folder,
        cursor,
        since,
        maxMessages: o.pageSize ?? 100,
      })
      if (!changes.ok) return { ok: false, error: changes.error, added }

      const got = changes.value.newOrUpdatedIds.length
        ? await o.provider.getMessages(changes.value.newOrUpdatedIds)
        : ({ ok: true, value: [] as MailMessage[] } as const)
      if (!got.ok) return { ok: false, error: got.error, added }

      // Sanitize before opening the transaction: it can be slow.
      const prepared = await Promise.all(
        got.value.map(async (m) => ({
          m,
          html: m.bodyHtml ? (await sanitizeHtml(m.bodyHtml)).html : null,
        })),
      )
      o.beforeCommit?.()
      const nextCursor = {
        ...state,
        folders: { ...state.folders, [row.providerId]: changes.value.nextCursor },
      }
      let dropped = 0
      await repos.transaction(async (tx) => {
        for (const { m, html } of prepared) {
          const thread = m.providerThreadId
            ? await tx.mail.upsertThread(o.accountId, m.providerThreadId, m.subject, m.receivedAt)
            : null
          await tx.mail.upsertMessages([
            {
              accountId: o.accountId,
              folderId: row.id,
              threadId: thread?.id ?? null,
              providerMessageId: m.providerMessageId,
              internetMessageId: m.internetMessageId,
              fromAddress: m.from.address,
              fromName: m.from.name ?? null,
              toJson: m.to,
              ccJson: m.cc,
              subject: m.subject,
              snippet: snippetOf(m),
              sentAt: m.sentAt,
              receivedAt: m.receivedAt,
              isRead: m.isRead,
              bodyText: m.bodyText,
              bodyHtmlSanitized: html,
              attachmentNames: m.attachmentNames,
              referencesJson: m.references,
              listUnsubscribe: m.listUnsubscribe,
              precedence: m.precedence,
              autoSubmitted: m.autoSubmitted,
            },
          ])
        }
        dropped = await tx.mail.deleteByProviderIds(o.accountId, changes.value.removedIds)
        await tx.accounts.update(o.accountId, { syncCursor: nextCursor })
      })
      added += prepared.length
      removed += dropped
      o.onPage?.({
        folderId: row.id,
        added: prepared.map((p) => p.m.providerMessageId),
        removed: dropped,
      })
      if (!changes.value.hasMore) break
    }
  }
  await repos.accounts.update(o.accountId, { lastSyncAt: now() })
  return { ok: true, added, removed }
}

/**
 * Syncs all of a user's active accounts, at most [concurrency] at a time. One
 * account failing (or throwing) never stops the others.
 */
export async function syncUser(
  o: Omit<SyncOptions, 'accountId' | 'provider'> & {
    providerFor(accountId: string): Promise<MailProvider>
    concurrency?: number
  },
): Promise<Record<string, SyncResult>> {
  const accounts = (await forUser(o.db, o.userId).accounts.list()).filter(
    (a) => a.status === 'active',
  )
  const out: Record<string, SyncResult> = {}
  const queue = [...accounts]
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      let provider: MailProvider | undefined
      try {
        provider = await o.providerFor(a.id)
        out[a.id] = await syncAccount({ ...o, accountId: a.id, provider })
      } catch {
        out[a.id] = { ok: false, error: { kind: 'unknown' }, added: 0 }
      } finally {
        await provider?.close().catch(() => undefined)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(o.concurrency ?? 2, accounts.length) }, worker))
  return out
}
