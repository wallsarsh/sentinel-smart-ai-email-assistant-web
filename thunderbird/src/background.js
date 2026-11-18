import { discover } from './discovery.js'
import { menuRegistrar } from './menus.js'
import { runBulk, selectedHeaders } from './bulk.js'
// Background event page: alarms, monitor, drafts, brief, calendar exports and message handlers.
// Nothing here can send mail; the add-on does not request send permissions.
import { resolveRoute, userContext, analyze, analyzeBatch, draftReply, runTextTask } from './ai.js'
import { normalizeAnalysis } from './analysis.js'
import { monitorBlockedReason } from './config.js'
import { briefIsCurrent, nextRun, refreshBrief, shouldRefreshBrief } from './brief.js'
import { eventsFromAnalysis, downloadIcs, writeCalendarEvents } from './calendar.js'
import {
  buildReplyIndex,
  drainDraftBacklog,
  draftEligibility,
  draftRequest,
  identityForHeader,
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
const UPDATE_API_MISSING =
  'The add-on update API is not loaded. Reload Sentinel, or reinstall the latest build so its update component is present.'
let applyingUpdate = false
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
async function sourceFolders(settings) {
  const folders = [...(await inboxFolders())]
  if (settings?.monitor?.includeLocalFolders !== false) {
    folders.push(...(await localMailFolders()))
  }
  return [...new Map(folders.map((f) => [f.id, f])).values()].filter((f) =>
    !settings.monitor?.accountIds || settings.monitor.accountIds.includes(f.accountId))
}

async function recentHeaders(since, max, settings = {}) {
  const out = []
  const failures = []
  for (const folder of await sourceFolders(settings)) {
    try { out.push(...await folderMessages(folder.id, since, max)) }
    catch { failures.push(folder.name || folder.id) }
  }
  out.folderErrors = failures
  return out
}

const api = {
  async discover(since, now, settings) {
    return discover({ area: browser.storage.local, folders: await sourceFolders(settings), since, now,
      query: (folderId, fromDate, toDate) => browser.messages.query({ folderId, fromDate, toDate, messagesPerPage: 100 }),
      next: (id) => browser.messages.continueList(id) })
  },
  async resolvePending(h) {
    const live = await resolveSource({ ...h, messageId: h.id, accountId: h.folder.accountId })
    return live?.folder?.id === h.folder.id ? { ...live, pendingKey: h.pendingKey, attempts: h.attempts || 0 } : null
  },
  async defer(header) {
    if (!header.pendingKey) return
    const attempts = (header.attempts || 0) + 1
    const delay = Math.min(60, 5 * 2 ** Math.min(attempts - 1, 4))
    await browser.storage.local.set({ [header.pendingKey]: { ...header, attempts, retryAt: Date.now() + delay * 60000 } })
  },
  acknowledge: (keys) => keys.length ? browser.storage.local.remove(keys) : Promise.resolve(),
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

async function replyIndex(accountId, fresh = false) {
  const key = accountId ?? 'all'
  const hit = replyIndexes.get(key)
  const now = Date.now()
  if (!fresh && hit && now - hit.at < REPLY_TTL) return hit.set
  const since = new Date(hit ? hit.at - 300000 : now - 90 * 86400000)
  const allowed = await foldersForAccount(accountId)
  const folders = [...(await sentFolders()), ...(await draftsFolders())]
    .filter((f) => !allowed || allowed.has(f.id))
  const set = new Set(hit?.set)
  for (const folder of folders) {
    const headers = await folderMessages(folder.id, since, Infinity)
    for (const header of headers) {
      const full = await browser.messages.getFull(header.id)
      for (const id of buildReplyIndex([{ full }])) set.add(id)
    }
  }
  replyIndexes.set(key, { at: now, set })
  return set
}

async function isReplied(header, fresh = false) {
  if (!header?.headerMessageId) return false
  const set = await replyIndex(accountIdOf(header), fresh)
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

const createMenus = menuRegistrar(browser, (state) => browser.storage.local.set({ 'sentinel.menuStatus': state }))

browser.menus?.onClicked.addListener(async (info, tab) => {
  if (!String(info.menuItemId).startsWith('sentinel-')) return
  try {
    if (info.menuItemId === 'sentinel-dashboard') {
      await browser.tabs.create({ url: browser.runtime.getURL('dist/dashboard.html') })
      return
    }
    const headers = await selectedHeaders(info, tab, browser)
    if (!headers.length) throw new Error('Select one or more messages first.')
    const action = info.menuItemId.replace('sentinel-', '')
    const result = await startBulk(headers.map((h) => h.id), action)
    if (!result.ok) throw new Error(result.error)
    await browser.tabs.create({ url: browser.runtime.getURL('dist/dashboard.html#inbox') })
  } catch (e) {
    await browser.notifications.create('sentinel-context-error', {
      type: 'basic', title: 'Sentinel AI', message: safeError(e),
    }).catch(() => undefined)
  }
})

let bulkRunning = false
async function startBulk(ids, action, previous = null, queueKey = null) {
  const allowed = ['analyze', 'draft', 'summary', 'actions', 'categorize', 'calendar', 'important', 'marketing', 'ignore', 'normal']
  if (!allowed.includes(action) || !ids.length) return { ok: false, error: 'Choose messages and an action.' }
  if (applyingUpdate) return { ok: false, error: 'Sentinel is updating.' }
  if (bulkRunning) return { ok: false, error: 'A bulk action is already running. See its progress in the dashboard.' }
  bulkRunning = true
  const key = queueKey || `sentinel.retryJob:${crypto.randomUUID()}`
  const attempt = (previous?.attempt || 0) + 1
  const save = async (job) => {
    const record = { ...job, attempt, nextRetry: Date.now() + Math.min(60, 5 * 2 ** Math.min(attempt - 1, 4)) * 60_000 }
    await browser.storage.local.set({ [key]: record, 'sentinel.bulkJob': record })
    if (job.state === 'done') await browser.storage.local.remove(key)
  }
  void runBulk(ids, async (id) => {
    const header = await browser.messages.get(id)
    if (['important', 'marketing', 'ignore', 'normal'].includes(action)) {
      await addRule(header.author, action)
      return { subject: header.subject, summary: `Sender rule saved: ${action}` }
    }
    if (action === 'draft') {
      const result = await manualDraft(id)
      return { ...result, subject: header.subject, summary: result.ok ? 'Draft saved. Nothing sent.' : '' }
    }
    let analysis = await store.analysis(header)
    if (!analysis || action === 'analyze' || action === 'categorize') {
      const result = await batchAnalyze([id])
      if (!result.ok || result.failed) throw new Error(result.error || 'Analysis failed')
      analysis = await store.analysis(header)
    }
    if (!analysis) throw new Error('No analysis available')
    if (action === 'categorize') {
      const result = await tagger({ header, analysis, known: await store.tagKeys() })
      if (result.warning) throw new Error(result.warning)
      await store.saveTagKeys(result.known)
    }
    if (action === 'calendar') {
      const events = eventsFromAnalysis(analysis, { header })
      if (!events.length) throw new Error('No dated action or event found')
      await writeCalendarEvents(events, { api: browser.sentinelCalendar, downloads: browser.downloads })
    }
    return { subject: header.subject, summary: analysis.summary, category: analysis.category, actionItems: analysis.actionItems }
  }, save, action, previous)
    .catch((e) => browser.storage.local.set({ 'sentinel.bulkJob': { state: 'error', error: safeError(e) } }))
    .finally(() => { bulkRunning = false })
  return { ok: true, started: true }
}

async function retryFailedMessages() {
  if (bulkRunning) return
  const entries = Object.entries(await browser.storage.local.get(null))
    .filter(([key, job]) => key.startsWith('sentinel.retryJob:') && job.nextRetry <= Date.now())
    .sort((a, b) => a[1].nextRetry - b[1].nextRetry)
  const next = entries[0]
  if (next) await startBulk(next[1].ids, next[1].action, next[1], next[0])
}

// ---- orchestration ---------------------------------------------------------------------------------------------

async function load() {
  const [settings, rules] = await Promise.all([store.settings(), store.rules()])
  return { settings, rules }
}

async function saveDraftFor(header, body) {
  const identityId = await identityForHeader(header)
  return saveDraftWithCompose(header, body, { identityId })
}

const draftLocks = new Set()
async function resolveSource(row) {
  const matches = (h) => h && (!row.accountId || h.folder?.accountId === row.accountId) &&
    (row.headerMessageId ? h.headerMessageId === row.headerMessageId : h.id === row.messageId && h.subject === row.subject &&
      new Date(h.date).getTime() === new Date(row.date).getTime())
  const current = await browser.messages.get(row.messageId).catch(() => null)
  if (matches(current)) return current
  if (row.accountId && row.headerMessageId) {
    let page = await browser.messages.query({ headerMessageId: row.headerMessageId })
    for (;;) {
      const source = page.messages.find(matches)
      if (source) return source
      if (!page.id) break
      page = await browser.messages.continueList(page.id)
    }
  }
  return null
}
async function createDraftsFor(settings) {
  return drainDraftBacklog({ settings, store, folders: new Set((await sourceFolders(settings)).map((f) => f.id)),
    resolveSource, manualDraft, isLocked: (id) => draftLocks.has(id),
    reconcileSave: async (header) => {
      return isReplied(header, true)
    } })
}

async function maybeRefreshBrief({ settings, rules, ctx, now, analyses, force }) {
  const current = await store.brief()
  const prior = await store.briefStatus()
  if (!force && (prior?.nextRetryAt > now.getTime() || prior?.needsSetup)) return { skipped: true }
  if (!force && current && !current.partial && briefIsCurrent(current, now) &&
      (!settings.brief.updateHourly || now - new Date(current.createdAt) < 3600000)) return { skipped: true }
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
  if (applyingUpdate) return { skipped: true }
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

/** Brief-only path: no monitor batch in front, so a stopped provider cannot block the brief. */
async function runBriefOnly() {
  if (applyingUpdate) return { skipped: true }
  const { settings, rules } = await load()
  const blocked = monitorBlockedReason(settings)
  if (blocked) {
    const at = new Date().toISOString()
    await store.saveBriefStatus({ state: 'error', at, message: blocked, progress: null })
    return { ok: false, error: blocked }
  }
  if (applyingUpdate) return { skipped: true }
  if (briefRunning) return briefRunning
  const ctx = await context(settings, rules)
  if (applyingUpdate) return { skipped: true }
  if (briefRunning) return briefRunning
  briefRunning = refreshBrief({
    store,
    api,
    settings,
    rules,
    ctx,
    now: new Date(),
    fetchImpl: undefined,
  })
    .then(async (result) => {
      if (result.status?.state === 'done') {
        await updateBriefBadge(result.brief)
        if (settings.brief.notify) await notifyBriefUpdated(result.brief)
      }
      return result
    })
    .catch(async (e) => {
      const message = safeError(e)
      await store.saveBriefStatus({ state: 'error', at: new Date().toISOString(), message })
      return { brief: await store.brief(), status: { state: 'error', message } }
    })
    .finally(() => {
      briefRunning = null
    })
  return briefRunning
}

/** One monitor → drafts → brief pass. Concurrent requests share the same run. */
function runAssistant({ reason = 'alarm', force = false, forceBrief = false } = {}) {
  if (applyingUpdate) return Promise.resolve({ skipped: true })
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
    const drafts = await createDraftsFor(settings).catch((e) => {
      monitor.errors.push(safeError(e))
      return { created: [], failed: [safeError(e)] }
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
      ...(drafts.failed.length ? { state: 'partial', error: safeError(drafts.failed[0]) } : {}),
      draftsQueued: drafts.queued,
      draftsCreated: drafts.created.length,
      draftsFailed: drafts.failed.length,
      briefState: brief?.status?.state ?? null,
      briefAt: brief?.status?.at ?? null,
    }
    await store.saveMonitor(status)
    if (brief?.updated && brief.status?.state === 'done') {
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

async function catchUpBrief() {
  const settings = await store.settings()
  const now = new Date()
  if (!settings.brief.enabled || now.getHours() < settings.brief.hour || monitorBlockedReason(settings)) return
  const brief = await store.brief()
  const status = await store.briefStatus()
  if (status?.nextRetryAt > Date.now() || status?.needsSetup) return
  if (status?.state === 'error' || status?.state === 'partial' || !briefIsCurrent(brief, now) || brief.partial) await runBriefOnly()
}

async function schedule() {
  if (!await browser.alarms.get('sentinel-retry')) browser.alarms.create('sentinel-retry', { periodInMinutes: 5 })
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

    })
}

browser.alarms.onAlarm.addListener((a) => {
  if (a.name === 'sentinel-retry') {
    void retryFailedMessages().catch(() => undefined)
    void catchUpBrief()
  }
  else if (a.name === MONITOR_ALARM) void runAssistant({ reason: 'alarm' })
  else if (a.name === BRIEF_ALARM) void runBriefOnly().finally(schedule)
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
    await catchUpBrief()
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
  if (area === 'local' && changes.settings) void store.briefStatus().then((status) => {
    if (status?.needsSetup) return store.saveBriefStatus({ ...status, needsSetup: false, nextRetryAt: 0 })
  })
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

async function manualDraft(messageId, options = {}) {
  if (draftLocks.has(messageId)) return { ok: false, busy: true, error: 'Draft creation already running.' }
  draftLocks.add(messageId)
  try { return await generateDraft(messageId, options) }
  finally { draftLocks.delete(messageId) }
}
async function generateDraft(messageId, { force = false, auto = false, expected, progress = async () => {} } = {}) {
  await progress('Reading message and checking draft eligibility…')
  const header = await browser.messages.get(messageId)
  if (!header) return { ok: false, error: 'Open a message first.' }
  if (expected && ((expected.headerMessageId || null) !== (header.headerMessageId || null) || (expected.folder.accountId && expected.folder.accountId !== accountIdOf(header)))) throw new Error('Source message identity changed. Review the message.')
  const { settings } = await load()
  if (monitorBlockedReason(settings)) return { ok: false, error: monitorBlockedReason(settings) }
  const route = resolveRoute(settings, 'draft')
  const origin = new URL(route.provider.baseUrl).origin + '/*'
  if (!await browser.permissions.contains({ origins: [origin] })) throw new Error('Provider permission denied. Grant host access in Provider settings.')
  const rules = await store.rules()
  const ctx = await context(settings, rules)
  const message = toMailMessage(header, await browser.messages.getFull(header.id))
  const policy = preFilter(message, rules, settings)
  if (policy.action === 'local') return { ok: false, error: 'Message excluded by sender or filtering rules.' }
  let analysis = await store.analysis(header)
  if (!analysis) {
    analysis = await analyze(settings, message, ctx)
    analysis = { ...analysis, sender: header.author, by: 'ai', at: Date.now() }
    await store.saveAnalysis(header, analysis)
  } else {
    analysis = { ...analysis, ...normalizeAnalysis(analysis) }
  }
  const replied = await isReplied(header)
  const record = await store.draftRecord(header)
  if (!force && ['saving', 'review'].includes(record?.status)) return { ok: false, error: 'Check Drafts for an existing reply before creating another.' }
  if (!force) {
    const eligible = draftEligibility({
      analysis,
      header,
      settings,
      replied,
      draftRecord: record,
      now: new Date(),
      manual: !auto,
    })
    if (!eligible.ok) return { ok: false, error: eligible.reason }
  }
  await progress('Generating reply with your AI provider…')
  const body = await draftReply(
    settings,
    [message],
    ctx,
    draftRequest(analysis, settings),
  )
  await progress('Saving reply to Thunderbird Drafts…')
  if (auto) {
    const latest = await store.settings()
    if (!latest.monitor.enabled || !latest.monitor.autoDraft || preFilter(message, await store.rules(), latest).action === 'local' || !draftEligibility({ analysis, settings: latest, header }).ok) return { ok: false, error: 'Automation paused.' }
    if (await isReplied(header, true)) return { ok: false, error: 'A reply or draft already exists.' }
  }
  await store.saveDraftRecord(header, { status: 'saving', at: Date.now(), messageId, subject: header.subject })
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

// Jobs are owned by the background page, not the transient message popup.
const messageJobs = new Set()
const jobKey = (id) => `sentinel.messageJob:${id}`
async function startMessageJob(id, action, force) {
  if (!Number.isInteger(id) || !['draft', 'analyze'].includes(action)) throw new Error('Invalid message action.')
  if (messageJobs.has(id)) return { ok: false, error: 'An action is already running for this message.' }
  messageJobs.add(id)
  const key = jobKey(id)
  try {
    await browser.storage.local.set({ [key]: { state: 'running', action, at: Date.now() } })
  } catch (e) {
    messageJobs.delete(id)
    throw e
  }
  void (async () => {
    try {
      let result
      if (action === 'draft') result = await manualDraft(id, { force, progress: (stage) => browser.storage.local.set({ [key]: { state: 'running', action, stage, at: Date.now() } }) })
      else {
        const header = await browser.messages.get(id)
        const { settings, rules } = await load()
        const blocked = monitorBlockedReason(settings)
        if (blocked) throw new Error(blocked)
        const message = toMailMessage(header, await browser.messages.getFull(id))
        const plan = preFilter(message, rules, settings, new Date())
        const output = plan.action === 'local' ? plan.analysis : await analyze(settings, message, await context(settings, rules))
        const stored = withSender(applyAnalysisPolicy(output, plan), header, Date.now())
        stored.by = plan.action === 'local' ? 'rule' : 'ai'
        stored.promptVersion = plan.action === 'local' ? null : 'assistant.v1'
        await store.saveAnalysis(header, stored)
        try {
          const tagged = await tagger({ header, analysis: stored, known: await store.tagKeys() })
          if (tagged?.known) await store.saveTagKeys(tagged.known)
        } catch { /* Analysis remains available if tagging fails. */ }
        result = { ok: true }
      }
      if (result?.ok === false) throw new Error(result.error)
      await browser.storage.local.set({ [key]: { state: 'done', action, at: Date.now() } })
    } catch (e) {
      await browser.storage.local.set({ [key]: { state: 'error', action, error: safeError(e), at: Date.now() } })
    } finally { messageJobs.delete(id) }
  })()
  return { ok: true }
}

const composeJobs = new Map()
function startComposeJob(msg) {
  if (composeJobs.get(msg.tabId)?.state === 'running') return { ok: false, error: 'A compose action is already running.' }
  const job = { state: 'running', kind: msg.kind, selected: msg.selected }
  composeJobs.set(msg.tabId, job)
  void (async () => {
    try {
      const { settings, rules } = await load()
      const blocked = monitorBlockedReason(settings)
      if (blocked) throw new Error(blocked)
      job.result = msg.kind === 'draft'
        ? await draftReply(settings, [msg.message], await context(settings, rules), msg.request)
        : await runTextTask(settings, msg.kind, msg.system, msg.user)
      job.state = 'done'
    } catch (e) { job.state = 'error'; job.error = safeError(e) }
  })()
  return { ok: true }
}
browser.tabs.onRemoved?.addListener((id) => composeJobs.delete(id))

browser.runtime.onMessage.addListener(async (msg) => {
  if (!msg || typeof msg !== 'object') return undefined
  try {
    if (applyingUpdate) throw new Error('Sentinel is applying an update. Reopen it after it restarts.')
    if (msg.type === 'retry-auto-draft') {
      const row = (await store.drafts()).find((r) => r.messageId === msg.messageId && r.accountId === msg.accountId)
      if (row?.status !== 'failed' || !row.headerMessageId) throw new Error('Open the source message to review this draft.')
      const source = await resolveSource(row)
      const settings = await store.settings()
      if (!source || !(await sourceFolders(settings)).some(f => f.id === source.folder?.id))
        throw new Error('Source is outside the monitored folders.')
      return await manualDraft(source.id, { auto: true })
    }
    if (msg.type === 'update-check') {
      if (!browser.sentinelUpdates) return { ok: false, error: UPDATE_API_MISSING }
      const result = await browser.sentinelUpdates.check()
      if (!result?.ok) return { ok: false, error: result?.error || 'The update check failed.' }
      return { ok: true, version: result.version ?? null, notes: result.notes ?? null, source: result.source ?? null }
    }
    if (msg.type === 'update-apply') {
      if (!browser.sentinelUpdates) return { ok: false, error: UPDATE_API_MISSING }
      applyingUpdate = true
      try {
        if (monitorRunning || briefRunning || bulkRunning || draftLocks.size || messageJobs.size ||
            [...composeJobs.values()].some((j) => j.state === 'running') ||
            (await browser.tabs.query({ type: 'messageCompose' })).length)
          throw new Error('Finish the running actions and close compose windows before applying the update.')
        await browser.storage.local.set({ 'sentinel.expectedVersion': msg.version })
        const result = await browser.sentinelUpdates.apply(msg.version)
        if (!result?.ok) throw new Error(result?.error || 'The update could not be applied.')
      } catch (e) {
        await browser.storage.local.remove('sentinel.expectedVersion')
        throw e
      } finally { applyingUpdate = false }
      return { ok: true }
    }
    if (msg.type === 'compose-job-start') return startComposeJob(msg)
    if (msg.type === 'compose-job-status') return { ok: true, job: composeJobs.get(msg.tabId) ?? null }
    if (msg.type === 'ping') return { ok: true, at: Date.now(), menus: (await browser.storage.local.get('sentinel.menuStatus'))['sentinel.menuStatus'] }
    if (msg.type === 'monitor-run') {
      void runAssistant({ reason: 'manual', forceBrief: Boolean(msg.brief) })
      return { started: true }
    }
    if (msg.type === 'brief-run') {
      void runBriefOnly()
      return { started: true }
    }
    if (msg.type === 'brief-seen') {
      await clearBriefBadge()
      return { ok: true }
    }
    if (msg.type === 'message-job-start') return await startMessageJob(msg.messageId, msg.action, msg.force)
    if (msg.type === 'message-job-status') return { active: messageJobs.has(msg.messageId) }
    if (msg.type === 'draft-create') return await manualDraft(msg.messageId, { force: msg.force })
    if (msg.type === 'batch-run') return await startBulk(msg.ids ?? [], msg.action)
    if (msg.type === 'bulk-status') return { running: bulkRunning }
    if (msg.type === 'tag-message') {
      const header = await browser.messages.get(msg.messageId)
      const analysis = await store.analysis(header)
      if (!analysis) return { ok: false, error: 'Analyse the message first.' }
      const r = await tagger({ header, analysis, known: await store.tagKeys() })
      if (r?.known) await store.saveTagKeys(r.known)
      return { ok: true, warning: r?.warning ?? null }
    }
    if (msg.type === 'rule-set') return await addRule(msg.pattern, msg.kind)
    if (msg.type === 'rule-remove') return await removeRule(msg.id)
    if (msg.type === 'calendar-download') {
      const events = msg.events ?? []
      try {
        const written = await writeCalendarEvents(events, { api: browser.sentinelCalendar })
        return { ok: true, ...written }
      } catch (e) {
        const reason = safeError(e)
        // Never leave the user without an event, but do not duplicate a partial write.
        if (e?.created) {
          return { ok: false, error: `${reason} (${e.created} of ${events.length} events were already added.)` }
        }
        try {
          const file = await downloadIcs(events, { downloads: browser.downloads })
          return { ok: true, mode: 'download', filename: file.filename, warning: reason }
        } catch {
          return { ok: false, error: reason }
        }
      }
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

void browser.alarms.get('sentinel-retry').then((alarm) => { if (!alarm) return schedule() }).catch(() => undefined)
