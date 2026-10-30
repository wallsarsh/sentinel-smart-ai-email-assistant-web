import { analyze } from './ai.js'
import { triageKey } from './cache.js'

/**
 * The analysis of one message: the stored one when there is one (no AI call, no tokens), otherwise a fresh
 * one that is stored for the brief and for next time. `force` asks again.
 */
export async function getOrAnalyze({
  store,
  header,
  settings,
  message,
  ctx,
  fetchImpl,
  force = false,
}) {
  const key = triageKey(header)
  const hit = force ? null : await store.get(key)
  if (hit) return { result: hit, cached: true, at: hit.at }
  const result = await analyze(settings, message, ctx, fetchImpl)
  const saved = { ...result, sender: header.author, by: 'ai', at: Date.now() }
  await store.set(key, saved)
  return { result: saved, cached: false, at: saved.at }
}

const PRIORITY = { high: 'High importance', medium: 'Medium importance', low: 'Low importance' }

/** Text shown in the popup. Model output is only ever shown as text. */
export function formatSummary(r) {
  const lines = [
    `${PRIORITY[r.importance] ?? r.importance}${r.urgency === 'urgent' ? ' · urgent' : ''}${r.needsReply ? ' · needs a reply' : ''}`,
    '',
    r.summary,
  ]
  if (r.actionItems?.length) {
    lines.push('', 'Action items:')
    for (const a of r.actionItems)
      lines.push(`• ${a.text}${a.dueText || a.dueDate ? ` (${a.dueText || a.dueDate})` : ''}`)
  }
  return lines.join('\n')
}
