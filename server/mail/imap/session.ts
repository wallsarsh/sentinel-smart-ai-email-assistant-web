import { ImapFlow } from 'imapflow'
import type { ImapSettings } from '../../../shared/domain'

export type RawFolder = { path: string; name: string; specialUse?: string }
export type MailboxInfo = { uidValidity: number; uidNext: number; exists: number }
export type RawMessage = { uid: number; flags: string[]; internalDate: Date; source: Buffer }

/**
 * What the provider needs from an IMAP connection. Keeping it narrow makes the
 * provider testable with an in-memory server and keeps the read-only rules
 * (EXAMINE, BODY.PEEK) in one reviewed place.
 */
export interface ImapSession {
  list(): Promise<RawFolder[]>
  /** Selects read-only (EXAMINE): flags can never change. */
  open(path: string): Promise<MailboxInfo>
  /** UIDs >= minUid in the open mailbox, optionally only mail since a date. */
  uids(minUid: number, since?: Date): Promise<number[]>
  /** Full messages using BODY.PEEK[], which does not set \Seen. */
  fetch(uids: number[]): Promise<RawMessage[]>
  /** UIDs in the open mailbox whose header contains the value. */
  searchHeader(name: string, value: string): Promise<number[]>
  /** Adds a message to a mailbox with the given flags; returns its UID when the server says. */
  append(path: string, raw: string, flags: string[]): Promise<number | null>
  /** Marks \Deleted and expunges exactly these UIDs. */
  remove(path: string, uids: number[]): Promise<void>
  close(): Promise<void>
}

export type Credentials = { username: string; password: string }

/** Real session over imapflow. Verified against a live server in T160. */
export async function connectImap(
  s: Pick<ImapSettings, 'imapHost' | 'imapPort' | 'imapSecurity'>,
  c: Credentials,
  o: { allowPrivate?: boolean } = {},
): Promise<ImapSession> {
  const client = new ImapFlow({
    host: s.imapHost,
    port: s.imapPort,
    secure: s.imapSecurity === 'implicit_tls',
    doSTARTTLS: s.imapSecurity === 'start_tls' ? true : undefined,
    auth: { user: c.username, pass: c.password },
    logger: false,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    socketTimeout: 30_000,
    disableAutoIdle: true,
  })
  void o
  await client.connect()
  let lock: { release(): void } | null = null

  return {
    async list() {
      const boxes = await client.list()
      return boxes.map((b) => ({ path: b.path, name: b.name, specialUse: b.specialUse }))
    },
    async open(path) {
      lock?.release()
      lock = await client.getMailboxLock(path, { readOnly: true })
      const m = client.mailbox
      if (!m) throw new Error('no mailbox')
      return { uidValidity: Number(m.uidValidity), uidNext: m.uidNext, exists: m.exists }
    },
    async uids(minUid, since) {
      const r = await client.search(
        { uid: `${minUid}:*`, ...(since ? { since } : {}) },
        { uid: true },
      )
      return (r || []).filter((u) => u >= minUid).sort((a, b) => a - b)
    },
    async fetch(uids) {
      if (!uids.length) return []
      const out: RawMessage[] = []
      // `source: true` is BODY.PEEK[]; imapflow never sets \Seen unless asked.
      for await (const m of client.fetch(
        uids.join(','),
        { uid: true, flags: true, internalDate: true, source: true },
        { uid: true },
      )) {
        out.push({
          uid: m.uid,
          flags: [...(m.flags ?? [])],
          internalDate:
            m.internalDate instanceof Date ? m.internalDate : new Date(m.internalDate ?? 0),
          source: m.source ?? Buffer.alloc(0),
        })
      }
      return out
    },
    async searchHeader(name, value) {
      return (await client.search({ header: { [name]: value } }, { uid: true })) || []
    },
    async append(path, raw, flags) {
      const r = await client.append(path, raw, flags)
      return r ? (r.uid ?? null) : null
    },
    async remove(path, uids) {
      if (!uids.length) return
      lock?.release()
      lock = await client.getMailboxLock(path)
      await client.messageDelete(uids.join(','), { uid: true })
    },
    async close() {
      lock?.release()
      lock = null
      await client.logout().catch(() => client.close())
    },
  }
}
