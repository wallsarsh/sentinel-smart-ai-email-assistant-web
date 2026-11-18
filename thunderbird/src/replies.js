// Correlating Sent Items with inbox messages, so "already replied" is durable and visible in the
// popup, dashboard and brief. Pure logic: the browser reads happen in background.js.

/** Strips angle brackets and whitespace from one Message-ID. */
export const normalizeMessageId = (id) =>
  String(id ?? '')
    .trim()
    .replace(/^</, '')
    .replace(/>$/, '')
    .trim()

/** Message-IDs referenced by a reply's In-Reply-To/References headers. */
export function referencedMessageIds(full) {
  const header = full?.headers ?? {}
  const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
  const raw = [
    ...list(header['in-reply-to'] ?? header['In-Reply-To']),
    ...list(header['references'] ?? header['References']),
  ].join(' ')
  const out = new Set()
  for (const m of raw.matchAll(/<([^<>@\s]+@[^<>\s]+)>/g)) out.add(m[1])
  return out
}

/** Set of Message-IDs already answered or drafted, from [{full}] items. */
export function buildReplyIndex(items = []) {
  const index = new Set()
  for (const item of items) for (const id of referencedMessageIds(item?.full)) index.add(id)
  return index
}

/**
 * Map of answered Message-ID → sent-message details, from [{header, full}] items in Sent folders.
 * `sentAt` is an ISO string so it can be stored as-is.
 */
export function buildSentReplyIndex(items = []) {
  const map = new Map()
  for (const item of items) {
    const header = item?.header ?? {}
    const at = new Date(header.date ?? 0)
    const sentAt = Number.isFinite(at.getTime()) ? at.toISOString() : null
    for (const id of referencedMessageIds(item?.full)) {
      if (map.has(id)) continue
      map.set(id, {
        sentMessageId: header.id ?? null,
        sentHeaderMessageId: header.headerMessageId ?? null,
        sentAt,
        subject: header.subject ?? '',
      })
    }
  }
  return map
}

/** Adds a durable reply marker to a stored analysis. Never removes an existing one. */
export function withReplyMarker(analysis, marker) {
  if (!analysis || !marker) return analysis
  if (analysis.replied && analysis.repliedMessageId === marker.sentMessageId) return analysis
  return {
    ...analysis,
    replied: true,
    repliedAt: marker.sentAt ?? null,
    repliedMessageId: marker.sentMessageId ?? null,
  }
}

/** True when the message asked for a reply that has not been answered yet. */
export const awaitingReply = (analysis) => Boolean(analysis?.needsReply) && !analysis?.replied
