import { PromptBuilder } from '../../packages/core/src/prompts/builder'
import { briefRank, PRIORITY_LABEL, priorityOf, runBrief } from '../../packages/core/src/brief'
import { analyzeBatch, briefAsk, describe } from './ai.js'
import { toMailMessage } from './mail.js'
import { applyAnalysisPolicy, preFilter, withSender } from './rules.js'
import { TRIAGE_PREFIX, triageKey } from './cache.js'

const DAY = 24 * 3600_000
const KEEP_MS = 14 * DAY
const BATCH = 8

/** Start of the current local day, used as the daily brief window. */
export function briefWindow(now = new Date()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

/** What goes into the brief: counted from stored results, ranked, capped. Pure, so it can be tested. */
export function selectForBrief(rows, { max = 60 } = {}) {
  const stats = {
    total: rows.length,
    needsReply: 0,
    p1: 0,
    p2: 0,
    newsletters: 0,
    notifications: 0,
  }
  const picked = []
  for (const { id, at, t } of rows) {
    const priority = priorityOf(t.importance, t.urgency)
    if (t.needsReply) stats.needsReply++
    if (priority === 'p1_do_now') stats.p1++
    if (priority === 'p2_today') stats.p2++
    if (t.category === 'newsletterMarketing') stats.newsletters++
    if (t.category === 'notificationAutomated') stats.notifications++
    const bulk = t.category === 'newsletterMarketing' || t.category === 'notificationAutomated'
    const rank = briefRank(priority, !!t.needsReply, bulk)
    if (rank === null) continue
    picked.push({ rank, at, id, priority, t })
  }
  picked.sort((a, b) => a.rank - b.rank || b.at - a.at)
  const emails = picked.slice(0, max).map(({ id, priority, t, ...rest }) => ({
    messageId: String(id),
    sender: t.sender || '',
    priority: PRIORITY_LABEL[priority],
    summary: t.summary,
    needsReply: !!t.needsReply,
    actions: (t.actionItems ?? []).map((a) =>
      a.dueText || a.dueDate ? `${a.text} (due ${a.dueText || a.dueDate})` : a.text,
    ),
    at: rest.at,
  }))
  return { stats, emails }
}

/**
 * Builds today's brief from the inbox of the last [hours]. `api` is the browser seam (so tests can fake it):
 * recent() → headers, full(id), accounts(), cache.get(key)/set(key, value)/prune(prefix, before).
 */
export async function generateBrief({
  api,
  settings,
  rules = [],
  ctx,
  now = new Date(),
  hours = 24,
  windowStart = null,
  maxMessages = 60,
  fetchImpl,
}) {
  const since = windowStart ? new Date(windowStart) : new Date(now.getTime() - hours * 3600_000)
  const self = ctx.selfAddresses
  const headers = (await api.recent(since, maxMessages, settings))
    .filter((h) => !self.has(String(h.author).replace(/^.*<|>$/g, '').toLowerCase()))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, maxMessages)

  const rows = []
  const todo = []
  for (const h of headers) {
    const key = triageKey(h)
    const hit = await api.cache.get(key)
    if (hit)
      rows.push({ id: h.id, at: new Date(h.date), t: { ...hit, sender: hit.sender || h.author } })
    else todo.push({ h, key })
  }

  // Only mail that has not been analysed yet costs tokens; results are kept for later briefs.
  const pending = []
  for (const { h, key } of todo) {
    const m = toMailMessage(h, await api.full(h.id))
    const plan = preFilter(m, rules, settings, now)
    if (plan.action === 'local') {
      const t = withSender(applyAnalysisPolicy(plan.analysis, plan), h, now.getTime())
      await api.cache.set(key, t)
      rows.push({ id: h.id, at: new Date(h.date), t })
    } else pending.push({ h, key, m })
  }
  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH)
    const out = await analyzeBatch(
      settings,
      chunk.map((c) => c.m),
      ctx,
      fetchImpl,
    )
    for (const c of chunk) {
      const r = out.get(String(c.m.providerMessageId))
      if (!r) continue // the next run tries again
      const t = withSender(applyAnalysisPolicy(r, { rule: null }), c.h, now.getTime())
      await api.cache.set(c.key, t)
      rows.push({ id: c.h.id, at: new Date(c.h.date), t })
    }
  }
  await api.cache.prune(TRIAGE_PREFIX, Date.now() - KEEP_MS)

  const { stats, emails } = selectForBrief(rows)
  const heads = Object.fromEntries(
    headers.map((h) => [String(h.id), { subject: h.subject, from: h.author }]),
  )
  const base = {
    createdAt: now.toISOString(),
    windowStart: since.toISOString(),
    windowEnd: now.toISOString(),
    stats,
    heads,
  }
  if (!emails.length) return { ...base, headline: '', sections: [], model: null }

  const res = await runBrief({
    emails,
    ctx,
    window: { start: since, end: now },
    stats,
    builder: new PromptBuilder({ compact: true }),
    ask: briefAsk(settings, fetchImpl),
  })
  if (!res.ok) throw new Error(describe(res.error))
  return {
    ...base,
    headline: res.value.headline,
    sections: res.value.sections,
    model: settings.model,
  }
}

/** Next local time at [hour]:00 after [now]. */
export function nextRun(now, hour) {
  const d = new Date(now)
  d.setHours(hour, 0, 0, 0)
  if (d <= now) d.setDate(d.getDate() + 1)
  return d
}

/** True when the stored brief belongs to the current local day. */
export const briefIsCurrent = (brief, now = new Date()) =>
  Boolean(brief?.windowStart) && new Date(brief.windowStart).toDateString() === now.toDateString()

/** Refresh policy: explicit request, new analyses, a new day, or no brief yet. */
export function shouldRefreshBrief({ brief, analyses = [], now = new Date(), force = false, enabled = true }) {
  if (!enabled && !force) return false
  if (force) return true
  if (analyses.length) return true
  return !briefIsCurrent(brief, now)
}

/**
 * Rebuilds the daily brief and records its status. The caller decides when a refresh is warranted;
 * this function always runs when called (manual refresh uses force=true).
 */
export async function refreshBrief({
  store,
  api,
  settings,
  rules = [],
  ctx,
  now = new Date(),
  fetchImpl,
}) {
  const started = now.toISOString()
  await store.saveBriefStatus({ state: 'running', at: started })
  try {
    const brief = await generateBrief({
      api,
      settings,
      rules,
      ctx,
      now,
      windowStart: briefWindow(now),
      maxMessages: Math.max(60, settings.monitor.maxMessagesPerRun),
      fetchImpl,
    })
    await store.saveBrief(brief)
    const status = {
      state: 'done',
      at: now.toISOString(),
      windowStart: brief.windowStart,
      model: brief.model,
    }
    await store.saveBriefStatus(status)
    return { brief, status }
  } catch (e) {
    const status = {
      state: 'error',
      at: now.toISOString(),
      message: String(e?.message ?? e).slice(0, 180),
    }
    await store.saveBriefStatus(status)
    return { brief: await store.brief(), status }
  }
}
