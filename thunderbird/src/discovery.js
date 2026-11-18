// Commit each page's identities before its folder watermark. Interleave pages
// so a busy folder cannot delay recording the first page from another account.
export async function discover({ area, folders, query, next, since, now }) {
  const failures = []
  const pending = folders.map(folder => ({ folder, cursor: null }))
  while (pending.length) {
    const scan = pending.shift()
    const key = 'sentinel.scan:' + scan.folder.id
    try {
      let page
      if (scan.cursor) {
        page = await next(scan.cursor)
      } else {
        const marker = (await area.get(key))[key]
        if (!Number.isFinite(marker)) await area.set({ [key]: since.getTime() })
        const start = Number.isFinite(marker) ? new Date(marker - 300000) : since
        page = await query(scan.folder.id, start, now)
      }
      const rows = {}
      for (const h of page.messages) {
        const token = 'sentinel.pending:' + JSON.stringify([scan.folder.accountId, h.headerMessageId || h.id])
        rows[token] = { id: h.id, headerMessageId: h.headerMessageId, subject: h.subject,
          author: h.author, folder: { id: scan.folder.id, accountId: scan.folder.accountId },
          date: new Date(h.date).toISOString(), pendingKey: token }
      }
      const keys = Object.keys(rows)
      if (keys.length) {
        const existing = await area.get(keys)
        for (const token of keys) if (existing[token]?.retryAt) {
          rows[token].attempts = existing[token].attempts
          rows[token].retryAt = existing[token].retryAt
        }
        await area.set(rows)
      }
      if (page.id) pending.push({ folder: scan.folder, cursor: page.id })
      else await area.set({ [key]: now.getTime() })
    } catch { failures.push(scan.folder.name || String(scan.folder.id)) }
  }
  const included = new Set(folders.map((f) => f.id))
  const data = await area.get(null)
  const headers = Object.entries(data)
    .filter(([key, h]) => key.startsWith('sentinel.pending:') && included.has(h.folder?.id))
    .map(([, h]) => h)
  return { headers, failures }
}
