// Background event page: alarms, monitor, drafts, brief, calendar exports and message handlers.
// Nothing here can send mail; the add-on does not request send permissions.
import { userContext, analyze, analyzeBatch, draftReply } from './ai.js'
import { normalizeAnalysis } from './analysis.js'
import { monitorBlockedReason } from './config.js'
import { nextRun, refreshBrief, shouldRefreshBrief } from './brief.js'
import { eventsFromAnalysis, writeCalendarEvents } from './calendar.js'
import {
  buildReplyIndex,
  draftEligibility,
  draftRequest,
  identityForHeader,
  maybeCreateDrafts,
  saveDraftWithCompose,
} from './drafts.js'
import {
  accountIdOf,
  draftsFolders,
  flattenFolders,
  localMailFolders,
  inboxFolders,
  safeError,
  selfFrom,
  sentFolders,
  toMailMessage,
} from './mail.js'
import { clearBriefBadge, notifyBriefUpdated, updateBriefBadge } from './notify.js'
import { runMonitor } from './monitor.js'
import { applyAnalysisPolicy, preFilter, withSender } from './rules.js'
import { createStore } from './store.js'
import { applyTags } from './tags.js'

const MONITOR_ALARM = 'sentinel-monitor'
const BRIEF_ALARM = 'sentinel-brief'
const WAKE_ALARM = 'sentinel-wake'
const NEW_MAIL_ALARM = 'sentinel-new-mail'

const store = createStore(browser.storage.local)
let monitorRunning = null
let briefRunning = null
const replyIndexes = new Map()
const REPLY_TTL = 10 * 60_000

// ---- Thunderbird API seams -------------------------------------------------------------------------------------

async function folderMessages(folderId, since, max) {
  const out = []
  let page = await browser.messages.query({
    folderId,
    fromDate: since,
    messagesPerPage: Math.min(100, max),
  })
  for (;;) {
    out.push(...(page.messages ?? []))
    if (!page.id || out.length >= max) break
    page = await browser.messages.continueList(page.id)
  }
  return out.slice(0, max)
}

/** Headers from every inbox folder. The monitor de-duplicates, filters and sorts. */
async function recentHeaders(since, max, settings = {}) {
  const out = []
  const folders = [...(await inboxFolders())]
  if (settings?.monitor?.includeLocalFolders !== false) {
    folders.push(...(await localMailFolders()))
  }
  const seen = new Set()
  for (const folder of folders) {
    if (seen.has(folder.id)) continue
    seen.add(folder.id)
    try {
      out.push(...(await folderMessages(folder.id, since, max * 2)))
    } catch {
      // One broken folder must not stop the others.
    }
  }
  return out
}

const api = {
  recent: recentHeaders,
  full: (id) => browser.messages.getFull(id),
  accounts: () => browser.accounts.list(true),
  cache: {
    async get(key) {
      return (await browser.storage.local.get(key))[key] ?? null
    },
    async set(key, value) {
      await browser.storage.local.set({ [key]: value })
    },
    async prune(prefix, before) {
      const all = await browser.storage.local.get(null)
      const stale = Object.keys(all).filter(
        (k) => k.startsWith(prefix) && (all[k]?.at ?? 0) < before,
      )
      if (stale.length) await browser.storage.local.remove(stale)
    },
  },
}

async function context(settings, rules = []) {
  const accounts = await api.accounts()
  const profile = { ...settings.profile }
  const self = selfFrom(accounts)
  profile.name = profile.name || self.name
  return userContext(accounts, new Date(), profile, rules)
}

// ---- reply index (already replied?) ---------------------------------------------------------------------------

async function foldersForAccount(accountId) {
  if (!accountId) return null
  const accounts = await api.accounts()
  const selected = accounts.filter((a) => String(a.id) === String(accountId))
  return new Set(flattenFolders(selected).map((f) => f.id))
}

async function scanFolder(folder, since) {
  const headers = await folderMessages(folder.id, since, 120)
  const items = []
  for (const h of headers) {
    try {
      items.push({ full: await browser.messages.getFull(h.id) })
    } catch {
      // An unreadable sent item must not hide the rest of the index.
    }
  }
  return items
}

/** Set of Message-IDs that already have a reply or draft, cached per account for 10 minutes. */
async function replyIndex(accountId, now = new Date()) {
  const key = accountId ?? 'all'
  const hit = replyIndexes.get(key)
  if (hit && now.getTime() - hit.at < REPLY_TTL) return hit.set
  const since = new Date(now.getTime() - 90 * 24 * 3600_000)
  const allowed = await foldersForAccount(accountId)
  const folders = [...(await sentFolders()), ...(await draftsFolders())].filter((f) =>
    allowed?.size ? allowed.has(f.id) : true,
  )
  const items = []
  for (const folder of folders) {
    try {
      items.push(...(await scanFolder(folder, since)))
    } catch {
      // Missing special-use folder: the local draft record still prevents duplicates.
    }
  }
  const set = new Set()
  for (const id of buildReplyIndex(items)) set.add(id)
  replyIndexes.set(key, { at: now.getTime(), set })
  return set
}

async function isReplied(header) {
  if (!header?.headerMessageId) return false
  const set = await replyIndex(accountIdOf(header))
  return set.has(header.headerMessageId)
}

// ---- tagging ---------------------------------------------------------------------------------------------------

const tagApi = () => {
  const tags = browser.messages?.tags
  if (!tags) return null
  return {
    list: () => tags.list(),
    create: (key, tag, color) => tags.create(key, tag, color),
    update: (id, props) => browser.messages.update(id, props),
  }
}

async function tagger({ header, analysis, known }) {
  const api = tagApi()
  if (!api) return { known, warning: 'This Thunderbird build does not support message tags.' }
  return applyTags({ api, header, analysis, known })
}

// ---- native context menus --------------------------------------------------------------------------------------

function createMenus() {
  try {
    if (!browser.menus?.create) return
    browser.menus.removeAll?.()
    const contexts = ['message_list', 'message_display']
    browser.menus.create({ id: 'sentinel', title: 'Sentinel AI', contexts })
    for (const [id, title] of [
      ['sentinel-analyze', 'Analyze selected'],
      ['sentinel-draft', 'Create draft reply'],
      ['sentinel-calendar', 'Add to calendar'],
    ])
      browser.menus.create({ id, parentId: 'sentinel', title, contexts })
    browser.menus.create({ id: 'sentinel-sender', parentId: 'sentinel', title: 'Sender rule', contexts })
    for (const [id, title] of [
      ['sentinel-important', 'Important'],
      ['sentinel-marketing', 'Marketing'],
      ['sentinel-ignore', 'Ignore'],
      ['sentinel-normal', 'Normal'],
    ])
      browser.menus.create({ id, parentId: 'sentinel-sender', title, contexts })
  } catch {
    // A missing menu API or an unsupported context must not stop the background page.
  }
}

async function targetHeaders(info) {
  if (info?.selectedMessages?.messages?.length) return info.selectedMessages.messages
  if (info?.messageId != null) {
    const header = await browser.messages.get(info.messageId)
    return header ? [header] : []
  }
  if (info?.tab?.id != null) {
    const header = await browser.messageDisplay.getDisplayedMessage(info.tab.id)
    return header ? [header] : []
  }
  return []
}

browser.menus?.onClicked.addListener(async (info) => {
  try {
    const headers = await targetHeaders(info)
    if (!headers.length) return
    if (info.menuItemId === 'sentinel-important') {
      await addRule(headers[0].author, 'important')
      return
    }
    if (info.menuItemId === 'sentinel-marketing') {
      await addRule(headers[0].author, 'marketing')
      return
    }
    if (info.menuItemId === 'sentinel-ignore') {
      await addRule(headers[0].author, 'ignore')
      return
    }
    if (info.menuItemId === 'sentinel-normal') {
      await addRule(headers[0].author, 'normal')
      return
    }
    if (info.menuItemId === 'sentinel-analyze') {
      await batchAnalyze(headers.map((h) => h.id))
      await browser.tabs.create({ url: browser.runtime.getURL('dist/dashboard.html') }).catch(() => undefined)
      return
    }
    if (info.menuItemId === 'sentinel-draft') {
      await batchDraft(headers.map((h) => h.id))
      return
    }
    if (info.menuItemId === 'sentinel-calendar') {
      const analysis = await store.analysis(headers[0])
      if (!analysis) throw new Error('Analyze the message first.')
      const events = eventsFromAnalysis(analysis, { header: headers[0] })
      if (!events.length) throw new Error('No dated action or event found.')
      const written = await writeCalendarEvents(events, {
        api: browser.sentinelCalendar,
        downloads: browser.downloads,
      })
      await browser.notifications
        .create('sentinel-calendar', {
          type: 'basic',
          title: 'Sentinel AI',
          message: written.mode === 'direct' ? 'Added to your calendar.' : 'Calendar file downloaded.',
        })
        .catch(() => undefined)
    }
  } catch (e) {
    await browser.notifications
      .create('sentinel-context-error', {
        type: 'basic',
        title: 'Sentinel AI',
        message: safeError(e),
      })
      .catch(() => undefined)
  }
})

// ---- orchestration ---------------------------------------------------------------------------------------------

async function load() {
  const [settings, rules] = await Promise.all([store.settings(), store.rules()])
  return { settings, rules }
}

async function saveDraftFor(header, body) {
  const identityId = await identityForHeader(header)
  return saveDraftWithCompose(header, body, { identityId })
}

async function createDraftsFor(analyses, settings, ctx) {
  if (!settings.monitor.autoDraft || !analyses.length) return { created: [], failed: [] }
  const candidates = []
  for (const item of analyses) {
    if (candidates.length >= (settings.monitor.maxDraftsPerRun ?? 0)) break
    const record = await store.draftRecord(item.header)
    const eligible = draftEligibility({
      analysis: item.analysis,
      header: item.header,
      settings,
      replied: await isReplied(item.header),
      draftRecord: record,
      now: new Date(),
    })
    if (eligible.ok) candidates.push(item)
  }
  if (!candidates.length) return { created: [], failed: [] }
  return maybeCreateDrafts({
    analyses: candidates,
    settings,
    ctx,
    store,
    isReplied,
    generate: draftReply,
    save: saveDraftFor,
    now: new Date(),
  })
}

async function maybeRefreshBrief({ settings, rules, ctx, now, analyses, force }) {
  const meaningful = analyses.filter((a) => !a.analysis.skipped)
  if (
    !shouldRefreshBrief({
      brief: await store.brief(),
      analyses: meaningful,
      now,
      force,
      enabled: settings.brief.enabled,
    })
  )
    return { skipped: true }
  if (briefRunning) return briefRunning
  briefRunning = refreshBrief({
    store,
    api,
    settings,
    rules,
    ctx,
    now,
    fetchImpl: undefined,
  })
    .then((result) => ({ ...result, updated: true }))
    .finally(() => {
      briefRunning = null
    })
  return briefRunning
}

/** One monitor → drafts → brief pass. Concurrent requests share the same run. */
function runAssistant({ reason = 'alarm', force = false, forceBrief = false } = {}) {
  if (monitorRunning) return monitorRunning
  monitorRunning = (async () => {
    const now = new Date()
    const { settings, rules } = await load()
    if (!settings.monitor.enabled && ['alarm', 'new-mail', 'startup'].includes(reason))
      return { ok: true, skipped: true }
    const blocked = monitorBlockedReason(settings)
    if (blocked) {
      const status = {
        state: 'error',
        at: now.toISOString(),
        reason,
        error: blocked,
        nextRunAt: null,
      }
      await store.saveMonitor(status)
      await store.saveBriefStatus({ state: 'error', at: now.toISOString(), message: blocked })
      return { ok: false, error: blocked, status }
    }
    const ctx = await context(settings, rules)
    const monitor = await runMonitor({
      store,
      api,
      settings,
      rules,
      ctx,
      now,
      force,
      reason,
      tag: tagger,
    })
    const drafts = await createDraftsFor(monitor.analyses, settings, ctx).catch((e) => {
      monitor.errors.push(safeError(e))
      return { created: [], failed: [] }
    })
    const brief = await maybeRefreshBrief({
      settings,
      rules,
      ctx,
      now,
      analyses: monitor.analyses,
      force: forceBrief,
    }).catch((e) => ({ status: { state: 'error', message: safeError(e) } }))
    const status = {
      ...monitor.status,
      draftsCreated: drafts.created.length,
      draftsFailed: drafts.failed.length,
      briefState: brief?.status?.state ?? null,
      briefAt: brief?.status?.at ?? null,
    }
    await store.saveMonitor(status)
    if (brief?.updated) {
      await updateBriefBadge(brief.brief)
      if (settings.brief.notify) await notifyBriefUpdated(brief.brief)
    }
    return { ok: true, monitor, drafts, brief, status }
  })()
    .catch(async (e) => {
      const status = {
        state: 'error',
        at: new Date().toISOString(),
        reason,
        error: safeError(e),
        nextRunAt: null,
      }
      await store.saveMonitor(status).catch(() => undefined)
      await store.saveBriefStatus({ state: 'error', at: status.at, message: status.error }).catch(
        () => undefined,
      )
      return { ok: false, error: status.error, status }
    })
    .finally(() => {
      monitorRunning = null
    })
  return monitorRunning
}

// ---- alarms ----------------------------------------------------------------------------------------------------

async function schedule() {
  const { settings } = await load()
  await browser.alarms.clear(MONITOR_ALARM)
  await browser.alarms.clear(BRIEF_ALARM)
  if (settings.monitor.enabled && !monitorBlockedReason(settings))
    browser.alarms.create(MONITOR_ALARM, {
      periodInMinutes: settings.monitor.intervalMinutes,
      when: Date.now() + 20_000,
    })
  if (settings.brief.enabled && !monitorBlockedReason(settings))
    browser.alarms.create(BRIEF_ALARM, {
      when: nextRun(new Date(), settings.brief.hour).getTime(),
      periodInMinutes: 24 * 60,
    })
}

browser.alarms.onAlarm.addListener((a) => {
  if (a.name === MONITOR_ALARM) void runAssistant({ reason: 'alarm' })
  else if (a.name === BRIEF_ALARM) void runAssistant({ reason: 'daily-brief' })
  else if (a.name === WAKE_ALARM) {
    void browser.alarms.clear(WAKE_ALARM)
    void runAssistant({ reason: 'startup' })
  } else if (a.name === NEW_MAIL_ALARM) {
    void browser.alarms.clear(NEW_MAIL_ALARM)
    void runAssistant({ reason: 'new-mail' })
  }
})

browser.runtime.onStartup.addListener(() => {
  void (async () => {
    await schedule()
    const { settings } = await load()
    if (settings.monitor.enabled && !monitorBlockedReason(settings))
      browser.alarms.create(WAKE_ALARM, { when: Date.now() + 15_000 })
  })()
})
browser.runtime.onInstalled.addListener(() => {
  createMenus()
  void schedule().catch(() => undefined)
})

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.settings || changes.senderRules)) void schedule().catch(() => undefined)
})

async function registerComposeScript() {
  if (!browser.composeScripts?.register) return
  try {
    await browser.composeScripts.register({ js: [{ file: 'dist/compose-script.js' }] })
  } catch {
    // Older Thunderbird builds: the compose assistant still works without selection tools.
  }
}
void registerComposeScript()
createMenus()

// Debounced new-mail wake; the monitor de-duplicates and filters.
browser.messages.onNewMailReceived?.addListener?.((folder) => {
  if (folder?.type && folder.type !== 'inbox') return
  void (async () => {
    const { settings } = await load()
    if (settings.monitor.enabled && !monitorBlockedReason(settings))
      browser.alarms.create(NEW_MAIL_ALARM, { when: Date.now() + 30_000 })
  })()
})

// ---- message handlers ------------------------------------------------------------------------------------------

async function manualDraft(messageId, { force = false } = {}) {
  const header = await browser.messages.get(messageId)
  if (!header) return { ok: false, error: 'Open a message first.' }
  const { settings } = await load()
  if (monitorBlockedReason(settings)) return { ok: false, error: monitorBlockedReason(settings) }
  const ctx = await context(settings, await store.rules())
  let analysis = await store.analysis(header)
  if (!analysis) {
    const full = await browser.messages.getFull(header.id)
    const message = toMailMessage(header, full)
    analysis = await analyze(settings, message, ctx)
    analysis = { ...analysis, sender: header.author, by: 'ai', at: Date.now() }
    await store.saveAnalysis(header, analysis)
  } else {
    analysis = { ...analysis, ...normalizeAnalysis(analysis) }
  }
  const replied = await isReplied(header)
  const record = await store.draftRecord(header)
  if (!force) {
    const eligible = draftEligibility({
      analysis,
      header,
      settings,
      replied,
      draftRecord: record,
      now: new Date(),
      manual: true,
    })
    if (!eligible.ok) return { ok: false, error: eligible.reason }
  }
  const body = await draftReply(
    settings,
    [toMailMessage(header, await browser.messages.getFull(header.id))],
    ctx,
    draftRequest(analysis, settings),
  )
  const saved = await saveDraftFor(header, body)
  const entry = {
    messageId: header.id,
    headerMessageId: header.headerMessageId ?? null,
    subject: header.subject ?? '',
    sender: header.author ?? '',
    accountId: accountIdOf(header),
    draftId: saved.id ?? null,
    draftHeaderMessageId: saved.headerMessageId ?? null,
    draftFolder: saved.folder?.name ?? null,
    status: 'saved',
    at: Date.now(),
  }
  await store.saveDraftRecord(header, entry)
  await store.appendDraft(entry)
  return { ok: true, draft: entry }
}

async function batchAnalyze(ids) {
  const { settings, rules } = await load()
  const blocked = monitorBlockedReason(settings)
  if (blocked) return { ok: false, error: blocked }
  const ctx = await context(settings, rules)
  const headers = []
  for (const id of ids.slice(0, 10)) {
    try {
      const header = await browser.messages.get(id)
      if (header) headers.push(header)
    } catch {
      // Skip a message that disappeared.
    }
  }
  const pending = []
  let local = 0
  let analyzed = 0
  const failed = []
  let knownTags = await store.tagKeys()
  for (const header of headers) {
    try {
      const message = toMailMessage(header, await browser.messages.getFull(header.id))
      const plan = preFilter(message, rules, settings, new Date())
      if (plan.action === 'local') {
        const stored = withSender(applyAnalysisPolicy(plan.analysis, plan), header)
        stored.promptVersion = null
        await store.saveAnalysis(header, stored)
        local++
      } else pending.push({ header, message, plan })
    } catch (e) {
      failed.push(safeError(e))
    }
  }
  for (let i = 0; i < pending.length; i += 8) {
    const chunk = pending.slice(i, i + 8)
    try {
      const out = await analyzeBatch(settings, chunk.map((c) => c.message), ctx)
      for (const item of chunk) {
        const raw = out.get(String(item.message.providerMessageId))
        if (!raw) {
          failed.push('No result for one message')
          continue
        }
        const stored = withSender(applyAnalysisPolicy(normalizeAnalysis(raw), item.plan), item.header)
        stored.promptVersion = 'assistant.v1'
        await store.saveAnalysis(item.header, stored)
        analyzed++
        if (settings.monitor.tagging) {
          try {
            const r = await tagger({ header: item.header, analysis: stored, known: knownTags })
            if (r?.known) knownTags = r.known
          } catch {
            // Tagging is optional.
          }
        }
      }
    } catch (e) {
      failed.push(safeError(e))
    }
  }
  if (Object.keys(knownTags).length) await store.saveTagKeys(knownTags)
  return { ok: true, analyzed, local, failed: failed.length, error: failed[0] ?? null }
}

async function batchDraft(ids) {
  const results = []
  for (const id of ids.slice(0, 5)) {
    try {
      results.push(await manualDraft(id))
    } catch (e) {
      results.push({ ok: false, error: safeError(e) })
    }
  }
  return {
    ok: true,
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    error: results.find((r) => !r.ok)?.error ?? null,
  }
}

async function addRule(pattern, kind) {
  const { normalizeRule } = await import('./rules.js')
  const rule = normalizeRule({ pattern, kind })
  const rules = await store.rules()
  const next = [...rules.filter((r) => r.pattern !== rule.pattern), rule]
  await store.saveRules(next)
  return { ok: true, rule }
}

async function removeRule(id) {
  const rules = await store.rules()
  await store.saveRules(rules.filter((r) => r.id !== id))
  return { ok: true }
}

browser.runtime.onMessage.addListener(async (msg) => {
  if (!msg || typeof msg !== 'object') return undefined
  try {
    if (msg.type === 'ping') return { ok: true, at: Date.now() }
    if (msg.type === 'monitor-run') {
      void runAssistant({ reason: 'manual', forceBrief: Boolean(msg.brief) })
      return { started: true }
    }
    if (msg.type === 'brief-run') {
      void runAssistant({ reason: 'brief-manual', forceBrief: true })
      return { started: true }
    }
    if (msg.type === 'brief-seen') {
      await clearBriefBadge()
      return { ok: true }
    }
    if (msg.type === 'draft-create') return manualDraft(msg.messageId, { force: msg.force })
    if (msg.type === 'batch-run') {
      if (msg.action === 'analyze') return batchAnalyze(msg.ids ?? [])
      if (msg.action === 'draft') return batchDraft(msg.ids ?? [])
      return { ok: false, error: 'Unknown batch action.' }
    }
    if (msg.type === 'tag-message') {
      const header = await browser.messages.get(msg.messageId)
      const analysis = await store.analysis(header)
      if (!analysis) return { ok: false, error: 'Analyse the message first.' }
      const r = await tagger({ header, analysis, known: await store.tagKeys() })
      if (r?.known) await store.saveTagKeys(r.known)
      return { ok: true, warning: r?.warning ?? null }
    }
    if (msg.type === 'rule-set') return addRule(msg.pattern, msg.kind)
    if (msg.type === 'rule-remove') return removeRule(msg.id)
    if (msg.type === 'calendar-download') {
      const written = await writeCalendarEvents(msg.events ?? [], {
        api: browser.sentinelCalendar,
        downloads: browser.downloads,
      })
      return { ok: true, ...written }
    }
    if (msg.type === 'open-dashboard') {
      await clearBriefBadge()
      await browser.tabs.create({ url: browser.runtime.getURL('dist/dashboard.html') })
      return { ok: true }
    }
    if (msg.type === 'status') return { monitor: await store.monitor(), brief: await store.briefStatus() }
  } catch (e) {
    return { ok: false, error: safeError(e) }
  }
  return undefined
})

browser.notifications.onClicked.addListener(() => {
  void clearBriefBadge()
  void browser.tabs.create({ url: browser.runtime.getURL('dist/dashboard.html') }).catch(() => undefined)
})

void schedule().catch(() => undefined)
