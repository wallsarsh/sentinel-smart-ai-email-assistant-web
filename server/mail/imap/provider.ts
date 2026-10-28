import { err, ok, type Result } from '../../../shared/errors/result'
import type { AppFailure } from '../../../shared/errors/failure'
import type { ChangeSet, FolderRole, MailFolder, MailMessage } from '../../../shared/domain'
import type { DraftRef, FetchChangesInput, MailProvider, ReplyDraft } from '../provider'
import { imapDrafts, parseRef, refFor } from './drafts'
import { parseRaw } from './parse'
import type { ImapSession, RawFolder } from './session'

const SPECIAL: Record<string, FolderRole> = {
  '\\Sent': 'sent',
  '\\Drafts': 'drafts',
  '\\Trash': 'trash',
  '\\Junk': 'spam',
  '\\Archive': 'archive',
  '\\All': 'archive',
}
const BY_NAME: [RegExp, FolderRole][] = [
  [/^(sent( items| mail| messages)?|gesendet)$/i, 'sent'],
  [/^(drafts?|entw(ü|u)rfe)$/i, 'drafts'],
  [/^(trash|deleted( items| messages)?|papierkorb)$/i, 'trash'],
  [/^(junk|spam|junk e-?mail)$/i, 'spam'],
  [/^archive$/i, 'archive'],
]

export const roleOf = (f: RawFolder): FolderRole =>
  f.path.toUpperCase() === 'INBOX'
    ? 'inbox'
    : (f.specialUse && SPECIAL[f.specialUse]) ||
      BY_NAME.find(([re]) => re.test(f.name))?.[1] ||
      'other'

type Cursor = { uidValidity?: number; lastUid?: number }

/** Failure for a dropped or refused connection. */
const failure = (e: unknown): AppFailure => {
  const m = String(
    (e as { message?: string; responseText?: string })?.responseText ?? (e as Error)?.message ?? '',
  )
  if (
    (e as { authenticationFailed?: boolean })?.authenticationFailed ||
    /AUTHENTICATIONFAILED|Invalid credentials|authentication failed/i.test(m)
  )
    return { kind: 'auth', problem: 'invalid_credentials' }
  return { kind: 'network', code: (e as { code?: string })?.code }
}

/**
 * IMAP read access. Mailboxes are opened read-only and bodies fetched with
 * BODY.PEEK, so reading never changes flags. Message ids are
 * `<folder>:<UIDVALIDITY>:<UID>`; a UIDVALIDITY change makes old ids invalid
 * and triggers a full resync of that folder.
 */
export class ImapMailProvider implements MailProvider {
  readonly type = 'imap' as const
  private folders: RawFolder[] | null = null
  private drafts

  constructor(
    private session: ImapSession,
    private o: { accountEmail: string; accountId: string; draftsFolder?: string },
  ) {
    this.drafts = imapDrafts({
      session,
      ...o,
      draftsPath: async () =>
        o.draftsFolder ?? (await this.raw()).find((f) => roleOf(f) === 'drafts')?.path ?? null,
    })
  }

  private async raw() {
    return (this.folders ??= await this.session.list())
  }

  private async run<T>(f: () => Promise<Result<T, AppFailure>>): Promise<Result<T, AppFailure>> {
    try {
      return await f()
    } catch (e) {
      return err(failure(e))
    }
  }

  testConnection() {
    return this.run(async () => (await this.raw(), ok(undefined)))
  }

  listFolders() {
    return this.run(async () =>
      ok(
        (await this.raw()).map((f): MailFolder => ({
          providerId: f.path,
          name: f.name,
          role: roleOf(f),
          processed: roleOf(f) === 'inbox',
        })),
      ),
    )
  }

  fetchChanges(i: FetchChangesInput): Promise<Result<ChangeSet, AppFailure>> {
    return this.run(async () => {
      const c = (i.cursor ?? {}) as Cursor
      const info = await this.session.open(i.folder.providerId)
      const reset = c.uidValidity !== undefined && c.uidValidity !== info.uidValidity
      const from = reset || c.lastUid === undefined ? 1 : c.lastUid + 1
      let uids = await this.session.uids(from, from === 1 ? i.since : undefined)
      const max = i.maxMessages ?? 200
      const more = uids.length > max
      uids = uids.slice(0, max)
      const last = uids.at(-1)
      return ok({
        newOrUpdatedIds: uids.map((u) => refFor(i.folder.providerId, info.uidValidity, u)),
        removedIds: [],
        nextCursor: {
          uidValidity: info.uidValidity,
          lastUid: last ?? (from === 1 ? Math.max(info.uidNext - 1, 0) : (c.lastUid ?? 0)),
        },
        hasMore: more,
      })
    })
  }

  getMessages(ids: string[]): Promise<Result<MailMessage[], AppFailure>> {
    return this.run(async () => {
      const byFolder = new Map<string, { id: string; uid: number; validity: number }[]>()
      for (const id of ids) {
        const p = parseRef(id)
        if (p)
          byFolder.set(p.path, [
            ...(byFolder.get(p.path) ?? []),
            { id, uid: p.uid, validity: p.uidValidity },
          ])
      }
      const out = new Map<string, MailMessage>()
      for (const [path, items] of byFolder) {
        const info = await this.session.open(path)
        const valid = items.filter((x) => x.validity === info.uidValidity)
        const raws = await this.session.fetch(valid.map((x) => x.uid))
        for (const r of raws) {
          const id = refFor(path, info.uidValidity, r.uid)
          out.set(id, await parseRaw(id, r))
        }
      }
      return ok(ids.flatMap((id) => out.get(id) ?? []))
    })
  }

  getThread(threadId: string): Promise<Result<MailMessage[], AppFailure>> {
    return this.run(async () => {
      const out: MailMessage[] = []
      for (const f of (await this.raw()).filter((x) => ['inbox', 'sent'].includes(roleOf(x)))) {
        const info = await this.session.open(f.path)
        const uids = [
          ...new Set([
            ...(await this.session.searchHeader('References', threadId)),
            ...(await this.session.searchHeader('Message-ID', threadId)),
          ]),
        ]
        for (const r of await this.session.fetch(uids)) {
          const id = refFor(f.path, info.uidValidity, r.uid)
          out.push(await parseRaw(id, r))
        }
      }
      return ok(out.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime()))
    })
  }

  createReplyDraft = (d: ReplyDraft) => this.drafts.create(d)
  updateDraft = (r: DraftRef, d: ReplyDraft) => this.drafts.update(r, d)
  deleteDraft = (r: DraftRef) => this.drafts.delete(r)
  nativeLink = (_r: DraftRef): string | null => null

  async close() {
    await this.session.close().catch(() => undefined)
  }
}
