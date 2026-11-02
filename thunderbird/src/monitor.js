// Incremental inbox monitor. All browser access is behind the injected api, so this runs in tests.
import { analyzeBatch } from './ai.js'
import { normalizeAnalysis } from './analysis.js'
import { assistantPrompt } from './prompts.js'
import { toMailMessage } from './mail.js'
import { applyAnalysisPolicy, preFilter, withSender } from './rules.js'

const DAY = 24 * 3600_000
export const BATCH = 8

const safeError = (e) => {
  const text = String(e?.message ?? e ?? 'Unknown error')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length <= 180 ? text : `${text.slice(0, 179)}…`
}

const headerKey = (h) => String(h?.headerMessageId ?? h?.id ?? '')
const headerDate = (h) => new Date(h?.date ?? 0)
const isSelf = (author, self) => {
  const m = /<([^>\s]+)>$/.exec(String(author ?? ''))
  const address = (m ? m[1] : String(author ?? '')).trim().toLowerCase()
  return self?.has?.(address) ?? false
}

/** Deduplicates, drops self/old mail, newest first, then caps the header list. */
export function pickHeaders(headers, { self, since, max, now = new Date() }) {
  const seen = new Set()
  const out = []
  for (const h of headers ?? []) {
    const key = headerKey(h)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const at = headerDate(h)
    if (!Number.isFinite(at.getTime()) || at < since || at > new Date(now.getTime() + DAY)) continue
    if (isSelf(h.author, self)) continue
    out.push(h)
  }
  out.sort((a, b) => headerDate(b) - headerDate(a))
  return out.slice(0, max)
}

/**
 * Runs one incremental monitor pass.
 * Returns the analyses produced and the status written to storage.
 */
export async function runMonitor({
  store,
  api,
  settings,
  rules = [],
  ctx,
  now = new Date(),
  force = false,
  reason = 'alarm',
  analyze = analyzeBatch,
  tag,
  fetchImpl,
}) {
  const previous = (await store.monitor()) ?? {}
  const since = force
    ? new Date(now.getTime() - (settings.monitor.lookbackDays ?? 3) * DAY)
    : previous.lastScanAt
      ? new Date(previous.lastScanAt - 5 * 60_000)
      : new Date(now.getTime() - (settings.monitor.lookbackDays ?? 3) * DAY)
  const nextRunAt = new Date(now.getTime() + settings.monitor.intervalMinutes * 60_000).toISOString()
  await store.saveMonitor({
    state: 'running',
    at: now.toISOString(),
    nextRunAt,
    reason,
    lastScanAt: previous.lastScanAt ?? null,
  })

  const errors = []
  const analyses = []
  let skipped = 0
  let cached = 0
  let local = 0
  let headers
  let rawHeaders
  try {
    rawHeaders = await api.recent(since, settings.monitor.maxMessagesPerRun * 2)
    headers = pickHeaders(rawHeaders, {
      self: ctx?.selfAddresses,
      since,
      max: settings.monitor.maxMessagesPerRun,
      now,
    })
  } catch (e) {
    const status = {
      state: 'error',
      at: now.toISOString(),
      nextRunAt,
      reason,
      lastScanAt: previous.lastScanAt ?? null,
      processed: 0,
      analysed: 0,
      local: 0,
      cached: 0,
      skipped: 0,
      pending: 0,
      error: safeError(e),
    }
    await store.saveMonitor(status)
    return { status, analyses, errors: [status.error] }
  }

  const queue = []
  for (const header of headers) {
    const hit = force ? null : await store.analysis(header)
    if (hit) {
      cached++
      continue
    }
    let message
    try {
      message = toMailMessage(header, await api.full(header.id))
    } catch (e) {
      errors.push(`Message ${header.id}: ${safeError(e)}`)
      skipped++
      continue
    }
    const plan = preFilter(message, rules, settings, now)
    if (plan.action === 'local') {
      const analysis = withSender(
        applyAnalysisPolicy(plan.analysis, plan),
        header,
        now.getTime(),
      )
      analysis.promptVersion = null
      await store.saveAnalysis(header, analysis)
      analyses.push({ header, message, analysis })
      local++
      continue
    }
    queue.push({ header, message, plan })
  }

  // Important senders first, then newest. Only this queue costs tokens.
  queue.sort((a, b) => Number(b.plan.boostImportance) - Number(a.plan.boostImportance) || headerDate(b.header) - headerDate(a.header))
  const budget = settings.monitor.maxAiMessagesPerRun ?? 0
  const runnable = queue.slice(0, budget)
  const pending = queue.length - runnable.length

  let tagWarning = null
  let knownTags = await store.tagKeys()
  const maybeTag = async (header, analysis) => {
    if (!settings.monitor.tagging || !tag) return
    try {
      const r = await tag({ header, analysis, known: knownTags })
      if (r?.known) knownTags = r.known
      if (r?.warning) tagWarning = r.warning
    } catch {
      tagWarning = 'The message could not be tagged.'
    }
  }

  for (let i = 0; i < runnable.length; i += BATCH) {
    const chunk = runnable.slice(i, i + BATCH)
    let result
    try {
      result = await analyze(
        settings,
        chunk.map((c) => c.message),
        ctx,
        fetchImpl,
      )
    } catch (e) {
      // Keep earlier batches; the next run retries this one.
      errors.push(safeError(e))
      continue
    }
    for (const c of chunk) {
      const raw = result.get(String(c.message.providerMessageId))
      if (!raw) {
        errors.push(`No result for message ${c.header.id}`)
        continue
      }
      const analysis = withSender(
        applyAnalysisPolicy(normalizeAnalysis(raw), c.plan),
        c.header,
        now.getTime(),
      )
      analysis.promptVersion = assistantPrompt.version
      await store.saveAnalysis(c.header, analysis)
      analyses.push({ header: c.header, message: c.message, analysis })
      await maybeTag(c.header, analysis)
    }
  }

  // Local analyses can also be tagged (best effort, one by one).
  for (const item of analyses) if (item.analysis.by === 'rule') await maybeTag(item.header, item.analysis)

  if (Object.keys(knownTags).length) await store.saveTagKeys(knownTags)
  await store.prune(now.getTime())

  const oldest = headers.length
    ? Math.min(...headers.map((h) => headerDate(h).getTime()))
    : now.getTime()
  const uniqueHeaders = new Set(rawHeaders.map(headerKey)).size
  const truncated = headers.length >= settings.monitor.maxMessagesPerRun && uniqueHeaders > headers.length
  const status = {
    state: errors.length ? 'partial' : 'done',
    at: now.toISOString(),
    nextRunAt,
    reason,
    // If a run was capped, scan from the oldest processed message next time so older mail is not skipped.
    lastScanAt:
      pending || errors.length
        ? (previous.lastScanAt ?? null)
        : truncated
          ? new Date(oldest - 1).toISOString()
          : now.toISOString(),
    processed: headers.length,
    analysed: analyses.length,
    local,
    cached,
    skipped,
    pending,
    truncated,
    tagWarning,
    error: errors.length ? errors[0] : null,
  }
  await store.saveMonitor(status)
  return { status, analyses, errors }
}
