import { userContext } from './ai.js'
import { generateBrief, nextRun } from './brief.js'
import { withDraft } from './mail.js'

// Opening the reply window closes the toolbar popup and ends its scripts, so the popup hands the draft to this
// page, which outlives it and finishes filling in the reply.
async function openReply(msg) {
  const tab = await browser.compose.beginReply(msg.messageId, 'replyToSender')
  const details = await browser.compose.getComposeDetails(tab.id)
  await browser.compose.setComposeDetails(tab.id, withDraft(details, msg.draft))
  return { ok: true }
}

// ---- daily brief ----------------------------------------------------------------------------------------------

const ALARM = 'sentinel-daily-brief'
const DEFAULTS = { enabled: true, hour: 8 }
let running = null

const briefSettings = async () => ({
  ...DEFAULTS,
  ...((await browser.storage.local.get('briefSettings')).briefSettings ?? {}),
})

async function inboxFolders() {
  if (browser.folders?.query) {
    try {
      return await browser.folders.query({ specialUse: ['inbox'] })
    } catch {
      // older builds: fall back to walking the accounts
    }
  }
  const walk = (fs) => (fs ?? []).flatMap((f) => [f, ...walk(f.subFolders)])
  return (await browser.accounts.list(true))
    .flatMap((a) => walk(a.folders))
    .filter((f) => f.type === 'inbox' || f.specialUse?.includes('inbox'))
}

const api = {
  async recent(since, max) {
    const out = []
    for (const folder of await inboxFolders()) {
      let page = await browser.messages.query({ folderId: folder.id, fromDate: since })
      for (;;) {
        out.push(...page.messages)
        if (out.length >= max * 2 || !page.id) break
        page = await browser.messages.continueList(page.id)
      }
    }
    return out
  },
  full: (id) => browser.messages.getFull(id),
  accounts: () => browser.accounts.list(),
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

/** Runs the brief once; concurrent requests share the same run. */
function runBrief({ notify = false } = {}) {
  running ??= (async () => {
    await browser.storage.local.set({ briefStatus: { state: 'running', at: Date.now() } })
    try {
      const { settings } = await browser.storage.local.get('settings')
      if (!settings?.baseUrl || !settings?.apiKey || !settings?.model)
        throw new Error('Set the API URL, key and model in the add-on settings first.')
      const brief = await generateBrief({
        api,
        settings,
        ctx: userContext(await api.accounts()),
      })
      await browser.storage.local.set({ brief, briefStatus: { state: 'done', at: Date.now() } })
      // Notifications carry no mail content.
      if (notify)
        await browser.notifications
          .create('sentinel-brief', {
            type: 'basic',
            title: 'Sentinel AI',
            message: 'Your daily brief is ready.',
          })
          .catch(() => undefined)
    } catch (e) {
      await browser.storage.local.set({
        briefStatus: { state: 'error', message: e.message, at: Date.now() },
      })
    } finally {
      running = null
    }
  })()
  return running
}

async function schedule() {
  await browser.alarms.clear(ALARM)
  const s = await briefSettings()
  if (!s.enabled) return
  browser.alarms.create(ALARM, {
    when: nextRun(new Date(), s.hour).getTime(),
    periodInMinutes: 24 * 60,
  })
}

browser.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) void runBrief({ notify: true })
})
browser.notifications.onClicked.addListener(
  () => void browser.action.openPopup?.().catch(() => undefined),
)
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.briefSettings) void schedule()
})
browser.runtime.onStartup.addListener(() => void schedule())
browser.runtime.onInstalled.addListener(() => void schedule())
void schedule() // event pages can be woken without either event

browser.runtime.onMessage.addListener(async (msg) => {
  if (msg?.type === 'open-reply') return openReply(msg)
  if (msg?.type === 'brief-run') {
    void runBrief()
    return { started: true }
  }
  return undefined
})
