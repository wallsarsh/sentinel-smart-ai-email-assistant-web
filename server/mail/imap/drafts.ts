import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import { buildReply, draftMessageId } from '../mime/reply-builder'
import type { DraftRef, ReplyDraft } from '../provider'
import { parseRaw } from './parse'
import type { ImapSession } from './session'

export const OURS = /^<sentinel-/
export const refFor = (path: string, uidValidity: number, uid: number) =>
  `${encodeURIComponent(path)}:${uidValidity}:${uid}`
export function parseRef(id: string): { path: string; uidValidity: number; uid: number } | null {
  const m = /^(.+):(\d+):(\d+)$/.exec(id)
  return m
    ? { path: decodeURIComponent(m[1]!), uidValidity: Number(m[2]), uid: Number(m[3]) }
    : null
}

/**
 * Drafts by APPEND to the Drafts folder with \Draft. IMAP cannot edit in place,
 * so an update appends the new version and then removes the old one; the
 * Message-ID (derived from the idempotency key) stays the same, which is also
 * how a retried create finds its draft. Only messages with our Message-ID
 * prefix are ever removed.
 */
export function imapDrafts(o: {
  session: ImapSession
  accountEmail: string
  accountId: string
  draftsPath: () => Promise<string | null>
}) {
  const { session } = o

  async function findOurs(
    path: string,
    mid: string,
  ): Promise<{ uid: number; uidValidity: number }[]> {
    const info = await session.open(path)
    const uids = await session.searchHeader('Message-ID', mid)
    if (!uids.length) return []
    const raws = await session.fetch(uids)
    const keep: { uid: number; uidValidity: number }[] = []
    for (const r of raws) {
      const m = await parseRaw('x', r)
      if (m.internetMessageId === mid && OURS.test(m.internetMessageId))
        keep.push({ uid: r.uid, uidValidity: info.uidValidity })
    }
    return keep
  }

  async function write(
    path: string,
    d: ReplyDraft,
    reuse = false,
  ): Promise<Result<DraftRef, AppFailure>> {
    const mid = draftMessageId(d.idempotencyKey, o.accountEmail)
    const built = buildReply({
      original: d.inReplyTo,
      from: { address: o.accountEmail },
      to: d.to,
      cc: d.cc,
      bodyText: d.bodyText,
      subject: d.subject,
      messageId: mid,
    })
    const old = await findOurs(path, mid)
    // A retried create keeps the draft it already made; edits go through update.
    if (reuse && old[0])
      return ok({
        accountId: o.accountId,
        providerDraftId: refFor(path, old[0].uidValidity, old[0].uid),
        providerMessageId: mid,
        createdAt: new Date(),
      })
    const uid = await session.append(path, built.raw, ['\\Draft', '\\Seen'])
    const info = await session.open(path)
    if (old.length)
      await session.remove(
        path,
        old.map((x) => x.uid),
      )
    const newUid = uid ?? Math.max(...(await session.searchHeader('Message-ID', mid)))
    return ok({
      accountId: o.accountId,
      providerDraftId: refFor(path, info.uidValidity, newUid),
      providerMessageId: mid,
      createdAt: new Date(),
    })
  }

  const guard = async <T>(f: () => Promise<Result<T, AppFailure>>) => {
    try {
      return await f()
    } catch {
      return err<AppFailure>({ kind: 'network' })
    }
  }

  return {
    create: (d: ReplyDraft) =>
      guard(async () => {
        const path = await o.draftsPath()
        return path ? write(path, d, true) : err({ kind: 'not_found' })
      }),
    update: (r: DraftRef, d: ReplyDraft) =>
      guard(async () => {
        const target = parseRef(r.providerDraftId)
        if (!target) return err({ kind: 'validation', field: 'draft', code: 'bad_ref' })
        // The draft must still be one of ours before it is replaced.
        const mid = draftMessageId(d.idempotencyKey, o.accountEmail)
        if (r.providerMessageId && r.providerMessageId !== mid)
          return err({ kind: 'forbidden', code: 'not_sentinel_draft' })
        const w = await write(target.path, d)
        return w.ok ? ok({ ...w.value, createdAt: r.createdAt }) : w
      }),
    delete: (r: DraftRef) =>
      guard(async () => {
        const target = parseRef(r.providerDraftId)
        if (!target) return ok(undefined)
        const info = await session.open(target.path)
        if (info.uidValidity !== target.uidValidity) return ok(undefined)
        const [raw] = await session.fetch([target.uid])
        if (!raw) return ok(undefined) // already gone
        const m = await parseRaw('x', raw)
        if (!OURS.test(m.internetMessageId))
          return err({ kind: 'forbidden', code: 'not_sentinel_draft' })
        await session.remove(target.path, [target.uid])
        return ok(undefined)
      }),
  }
}
