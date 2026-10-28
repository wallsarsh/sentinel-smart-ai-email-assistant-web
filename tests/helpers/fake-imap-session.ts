import type {
  ImapSession,
  MailboxInfo,
  RawFolder,
  RawMessage,
} from '../../server/mail/imap/session'

type Stored = RawMessage
/** In-memory IMAP server: folders, UIDs, UIDVALIDITY, header search and append/expunge. */
export class FakeImapSession implements ImapSession {
  folders: RawFolder[] = [
    { path: 'INBOX', name: 'INBOX' },
    { path: 'Sent Items', name: 'Sent Items', specialUse: '\\Sent' },
    { path: 'Drafts', name: 'Drafts', specialUse: '\\Drafts' },
  ]
  boxes = new Map<string, { uidValidity: number; nextUid: number; msgs: Stored[] }>()
  selected: string | null = null
  openedReadOnly = true
  down = false
  closed = false
  log: string[] = []

  box(path: string) {
    let b = this.boxes.get(path)
    if (!b) this.boxes.set(path, (b = { uidValidity: 1, nextUid: 1, msgs: [] }))
    return b
  }
  add(path: string, raw: string, flags: string[] = [], date = new Date('2026-10-27T09:00:00Z')) {
    const b = this.box(path)
    const uid = b.nextUid++
    b.msgs.push({ uid, flags, internalDate: date, source: Buffer.from(raw) })
    return uid
  }
  private guard() {
    if (this.down) throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' })
  }
  async list() {
    this.guard()
    return this.folders
  }
  async open(path: string): Promise<MailboxInfo> {
    this.guard()
    this.log.push(`EXAMINE ${path}`)
    this.selected = path
    const b = this.box(path)
    return { uidValidity: b.uidValidity, uidNext: b.nextUid, exists: b.msgs.length }
  }
  async uids(min: number, since?: Date) {
    return this.box(this.selected!)
      .msgs.filter((m) => m.uid >= min && (!since || m.internalDate >= since))
      .map((m) => m.uid)
  }
  async fetch(uids: number[]) {
    this.log.push('FETCH BODY.PEEK[]')
    return this.box(this.selected!)
      .msgs.filter((m) => uids.includes(m.uid))
      .map((m) => ({ ...m }))
  }
  async searchHeader(name: string, value: string) {
    const re = new RegExp(`^${name}:.*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'im')
    return this.box(this.selected!)
      .msgs.filter((m) => re.test(m.source.toString('utf8').replace(/\r\n[ \t]+/g, ' ')))
      .map((m) => m.uid)
  }
  async append(path: string, raw: string, flags: string[]) {
    this.log.push(`APPEND ${path} ${flags.join(' ')}`)
    return this.add(path, raw, flags)
  }
  async remove(path: string, uids: number[]) {
    const b = this.box(path)
    b.msgs = b.msgs.filter((m) => !uids.includes(m.uid))
  }
  async close() {
    this.closed = true
  }
}
