// Turns what Thunderbird's APIs return into the MailMessage the shared prompt builder takes.
// Only text and the headers that matter are passed on; attachment contents are never read.

/** "Name <a@b.c>" or "a@b.c" → { name, address }. */
export function parseAddress(raw) {
  const s = String(raw ?? '').trim()
  const m = /^(.*?)\s*<([^>]+)>$/.exec(s)
  const address = (m ? m[2] : s).trim()
  const name = m ? m[1].replace(/^"|"$/g, '').trim() : ''
  return name ? { address, name } : { address }
}

/** Finds the text and html bodies and the names of attachments in a messages.getFull() tree. */
export function readParts(root) {
  let text = ''
  let html = ''
  const attachmentNames = []
  const walk = (p) => {
    if (!p) return
    const type = String(p.contentType || '').toLowerCase()
    if (p.name || /attachment/i.test(p.headers?.['content-disposition']?.[0] ?? '')) {
      if (p.name) attachmentNames.push(p.name)
    } else if (p.body && type.startsWith('text/plain')) text += `${text ? '\n' : ''}${p.body}`
    else if (p.body && type.startsWith('text/html')) html += `${html ? '\n' : ''}${p.body}`
    for (const c of p.parts || []) walk(c)
  }
  walk(root)
  return { text, html, attachmentNames }
}

/** header: a MessageHeader; full: the result of messages.getFull(header.id). */
export function toMailMessage(header, full) {
  const { text, html, attachmentNames } = readParts(full)
  const sent = new Date(header.date)
  return {
    providerMessageId: String(header.id),
    providerThreadId: null,
    internetMessageId: header.headerMessageId ?? null,
    from: parseAddress(header.author),
    to: (header.recipients ?? []).map(parseAddress),
    cc: (header.ccList ?? []).map(parseAddress),
    subject: header.subject ?? '',
    sentAt: sent,
    receivedAt: sent,
    isRead: !!header.read,
    bodyText: text,
    bodyHtml: text.trim() ? null : html || null,
    attachmentNames,
    references: [],
    listUnsubscribe: full?.headers?.['list-unsubscribe']?.[0] ?? null,
  }
}

/** The user's own addresses and display name, from the Thunderbird identities. */
export function selfFrom(accounts) {
  const ids = accounts.flatMap((a) => a.identities ?? [])
  return {
    name: ids.find((i) => i.name)?.name ?? '',
    addresses: new Set(ids.map((i) => String(i.email ?? '').toLowerCase()).filter(Boolean)),
  }
}
const escapeHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Builds the compose update that puts the draft above the quoted original.
 * Thunderbird builds the quote itself and ignores a body passed to beginReply, so the draft is added afterwards.
 */
export function withDraft(details, draft) {
  if (details.isPlainText) {
    const quote = (details.plainTextBody || '').replace(/^\n+/, '')
    return { plainTextBody: `${draft}\n\n${quote}` }
  }
  const html = escapeHtml(draft).replace(/\n/g, '<br>')
  const body = details.body || ''
  const block = `<div>${html}</div><br>`
  return {
    body: /<body[^>]*>/i.test(body) ? body.replace(/(<body[^>]*>)/i, `$1${block}`) : block + body,
  }
}

/** Accepts https, or http only for a server on this computer. Returns the normalised base URL. */
export function checkBaseUrl(raw) {
  const u = new URL(String(raw).trim())
  if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname))
    throw new Error('The API URL must use https (http is allowed only for localhost).')
  return `${u.origin}${u.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '')}`
}

/** All folders below the accounts, flattened. */
export function flattenFolders(accounts) {
  const walk = (folders) => (folders ?? []).flatMap((f) => [f, ...walk(f.subFolders)])
  return (accounts ?? []).flatMap((a) => walk(a.folders))
}

/** Folders with a special use (inbox, sent, drafts, ...), with an account-walk fallback for older builds. */
export async function foldersBySpecialUse(use) {
  if (browser.folders?.query) {
    try {
      const found = await browser.folders.query({ specialUse: [use] })
      if (found?.length) return found
    } catch {
      // older builds: fall back to the account tree
    }
  }
  const accounts = await browser.accounts.list(true)
  return flattenFolders(accounts).filter(
    (f) => f.type === use || f.specialUse?.includes(use),
  )
}

export const inboxFolders = () => foldersBySpecialUse('inbox')

/** Local Folders mailboxes (including a generated demo folder), excluding system folders. */
export async function localMailFolders() {
  const accounts = await browser.accounts.list(true)
  const local = accounts.filter(
    (a) => a.type === 'none' || a.type === 'local' || !(a.identities?.length),
  )
  const system = new Set(['drafts', 'sent', 'trash', 'junk', 'outbox', 'templates', 'archives'])
  return flattenFolders(local).filter((f) => {
    if (f.type && system.has(f.type)) return false
    if (f.specialUse?.some((u) => system.has(String(u).toLowerCase()))) return false
    return !system.has(String(f.name ?? '').toLowerCase())
  })
}
export const sentFolders = () => foldersBySpecialUse('sent')
export const draftsFolders = () => foldersBySpecialUse('drafts')

/** The account a message belongs to, when Thunderbird included folder metadata. */
export const accountIdOf = (header) => header?.folder?.accountId ?? null

/** True when [author] is one of the user's identities. */
export function isOwnAddress(author, selfAddresses) {
  const m = /<([^>\s]+)>$/.exec(String(author ?? ''))
  const address = (m ? m[1] : String(author ?? '')).trim().toLowerCase()
  return selfAddresses?.has?.(address) ?? false
}

/** A content-free one-line error for status storage. */
export const safeError = (e) =>
  String(e?.message ?? e ?? 'Unknown error')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
