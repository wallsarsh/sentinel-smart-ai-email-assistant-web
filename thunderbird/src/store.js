// Storage seams and retention for the Thunderbird assistant. The browser area is injected, so tests use a Map.
import { mergeSettings, normalizeSettings } from './config'
import { normalizeRule } from './rules'

export const KEYS = {
  settings: 'settings',
  legacyBrief: 'briefSettings',
  rules: 'senderRules',
  brief: 'brief',
  briefStatus: 'briefStatus',
  briefJob: 'sentinel.briefJob',
  monitor: 'sentinel.monitor',
  drafts: 'sentinel.drafts',
  tagKeys: 'sentinel.tagKeys',
  triagePrefix: 'sentinel.triage:',
  draftPrefix: 'sentinel.draft:',
  replyPrefix: 'sentinel.replied:',
}

export const TRIAGE_PREFIX = KEYS.triagePrefix
export const triageKey = (header) => `${TRIAGE_PREFIX}${header?.headerMessageId ?? header?.id}`
export const draftKey = (header) => `${KEYS.draftPrefix}${header?.headerMessageId ?? header?.id}`
export const replyKey = (accountId, header) =>
  `${KEYS.replyPrefix}${accountId ?? 'account'}:${header?.headerMessageId ?? header?.id}`

const DAY = 24 * 3600_000

export function memoryArea(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    async get(key) {
      if (key === null) return Object.fromEntries(map)
      if (typeof key === 'string') return map.has(key) ? { [key]: map.get(key) } : {}
      const out = {}
      for (const k of key ?? []) if (map.has(k)) out[k] = map.get(k)
      return out
    },
    async set(values) {
      for (const [k, v] of Object.entries(values)) map.set(k, v)
    },
    async remove(key) {
      for (const k of Array.isArray(key) ? key : [key]) map.delete(k)
    },
  }
}

export function createStore(area) {
  const get = async (key) => (await area.get(key))[key] ?? null
  const set = (key, value) => area.set({ [key]: value })
  const remove = (key) => area.remove(key)
  const all = async () => (await area.get(null)) ?? {}

  const drafts = async () => {
    const list = await get(KEYS.drafts)
    return Array.isArray(list) ? list : []
  }

  const prunePrefix = async (prefix, before) => {
    const data = await all()
    const stale = Object.keys(data).filter((k) => {
      if (!k.startsWith(prefix)) return false
      const at = typeof data[k]?.at === 'number' ? data[k].at : 0
      return at < before
    })
    if (stale.length) await remove(stale)
    return stale
  }

  const pruneAnalyses = (now = Date.now(), days = 14) =>
    prunePrefix(TRIAGE_PREFIX, now - days * DAY)

  const readSettings = async () => {
    const [saved, legacy] = await Promise.all([get(KEYS.settings), get(KEYS.legacyBrief)])
    return normalizeSettings(saved ?? {}, legacy ?? {})
  }

  return {
    area,

    settings: readSettings,
    async saveSettings(settings) {
      const current = await readSettings()
      const next = normalizeSettings(mergeSettings(current, settings))
      await set(KEYS.settings, next)
      await remove(KEYS.legacyBrief)
      return next
    },

    async rules() {
      const saved = await get(KEYS.rules)
      if (!Array.isArray(saved)) return []
      const out = []
      for (const r of saved) {
        try {
          out.push(normalizeRule({ ...r, id: r.id }))
        } catch {
          // A corrupt rule must not prevent the inbox from working.
        }
      }
      return out
    },
    async saveRules(rules) {
      const out = []
      for (const r of rules ?? []) {
        try {
          out.push(normalizeRule(r))
        } catch {
          // skip invalid input; callers validate first
        }
      }
      await set(KEYS.rules, out)
      return out
    },

    async analysis(header) {
      return get(triageKey(header))
    },
    async saveAnalysis(header, analysis) {
      await set(triageKey(header), analysis)
      return analysis
    },
    async allAnalyses() {
      const data = await all()
      return Object.entries(data)
        .filter(([k]) => k.startsWith(TRIAGE_PREFIX))
        .map(([k, v]) => ({ key: k, id: k.slice(TRIAGE_PREFIX.length), ...v }))
    },
    pruneAnalyses,

    async brief() {
      return get(KEYS.brief)
    },
    async saveBrief(brief) {
      await set(KEYS.brief, brief)
      return brief
    },
    async briefJob() {
      return get(KEYS.briefJob)
    },
    async saveBriefJob(job) {
      await set(KEYS.briefJob, job)
      return job
    },
    async briefStatus() {
      return get(KEYS.briefStatus)
    },
    async saveBriefStatus(status) {
      await set(KEYS.briefStatus, status)
      return status
    },

    async monitor() {
      return get(KEYS.monitor)
    },
    async saveMonitor(status) {
      await set(KEYS.monitor, status)
      return status
    },

    drafts,
    async appendDraft(entry) {
      const list = await drafts()
      const next = [entry, ...list.filter((d) => d.messageId !== entry.messageId)].slice(0, 200)
      await set(KEYS.drafts, next)
      return next
    },
    async draftRecord(header) {
      return get(draftKey(header))
    },
    async saveDraftRecord(header, record) {
      await set(draftKey(header), record)
      return record
    },

    async tagKeys() {
      const saved = await get(KEYS.tagKeys)
      return saved && typeof saved === 'object' ? saved : {}
    },
    async saveTagKeys(keys) {
      await set(KEYS.tagKeys, keys)
      return keys
    },

    async replied(accountId, header) {
      return get(replyKey(accountId, header))
    },
    async saveReplied(accountId, header, value) {
      await set(replyKey(accountId, header), value)
      return value
    },

    async prune(now = Date.now()) {
      await pruneAnalyses(now, 14)
      await prunePrefix(KEYS.draftPrefix, now - 90 * DAY)
      await prunePrefix(KEYS.replyPrefix, now - 7 * DAY)
    },
  }
}
