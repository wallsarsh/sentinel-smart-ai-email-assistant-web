// Settings shape and migration for the Thunderbird assistant. Pure: no browser APIs, so it is testable in Node.
import {
  TASKS,
  defaultRoutes,
  normalizeProvider,
  normalizeRoutes,
  providerUsable,
} from './providers'

export const INTERVAL_OPTIONS = [15, 30, 60, 120, 240]
export const DRAFT_PRIORITIES = ['p1_do_now', 'p2_today', 'p3_this_week']
export const TONES = ['professional', 'friendly', 'concise', 'formal']

export const DEFAULT_SETTINGS = {
  baseUrl: '',
  apiKey: '',
  model: '',
  providers: [],
  defaultProviderId: '',
  routes: defaultRoutes([]),
  monitor: {
    enabled: true,
    intervalMinutes: 60,
    lookbackDays: 3,
    maxMessagesPerRun: 80,
    maxAiMessagesPerRun: 40,
    autoDraft: true,
    maxDraftsPerRun: 3,
    draftMinPriority: 'p2_today',
    analyzeMarketing: false,
    tagging: true,
  },
  brief: { enabled: true, hour: 8, updateHourly: true, notify: true },
  profile: { tone: 'professional', signOff: '', language: 'auto' },
}

const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback)
const int = (v, fallback, min, max) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}
const str = (v, fallback = '') => (typeof v === 'string' ? v.trim() : fallback)
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback)

const pick = (v) => (v && typeof v === 'object' ? v : {})

function normalizeProviders(saved) {
  if (Array.isArray(saved.providers)) return saved.providers.map(normalizeProvider)
  // Migration from the single-provider version.
  if (saved.baseUrl || saved.apiKey || saved.model)
    return [
      normalizeProvider({
        id: 'legacy',
        name: 'Default provider',
        kind: 'openai_compatible',
        baseUrl: saved.baseUrl,
        apiKey: saved.apiKey,
        model: saved.model,
      }),
    ]
  return []
}

/**
 * Merges saved settings over defaults, accepts the old top-level `briefSettings`,
 * clamps values and never mutates the input.
 */
export function normalizeSettings(raw = {}, legacyBrief = {}) {
  const saved = pick(raw)
  const monitor = pick(saved.monitor)
  const brief = pick(saved.brief)
  const profile = pick(saved.profile)
  const oldBrief = pick(legacyBrief)
  const providers = normalizeProviders(saved)
  const defaultProviderId =
    providers.find((p) => p.id === saved.defaultProviderId)?.id ?? providers[0]?.id ?? ''
  const primary = providers.find((p) => p.id === defaultProviderId) ?? providers[0]
  return {
    baseUrl: primary?.baseUrl ?? '',
    apiKey: primary?.apiKey ?? '',
    model: primary?.model ?? '',
    providers,
    defaultProviderId,
    routes: normalizeRoutes(pick(saved.routes), providers),
    monitor: {
      enabled: bool(monitor.enabled, DEFAULT_SETTINGS.monitor.enabled),
      intervalMinutes: int(
        monitor.intervalMinutes,
        DEFAULT_SETTINGS.monitor.intervalMinutes,
        15,
        720,
      ),
      lookbackDays: int(monitor.lookbackDays, DEFAULT_SETTINGS.monitor.lookbackDays, 1, 30),
      maxMessagesPerRun: int(
        monitor.maxMessagesPerRun,
        DEFAULT_SETTINGS.monitor.maxMessagesPerRun,
        1,
        500,
      ),
      maxAiMessagesPerRun: int(
        monitor.maxAiMessagesPerRun,
        DEFAULT_SETTINGS.monitor.maxAiMessagesPerRun,
        0,
        200,
      ),
      autoDraft: bool(monitor.autoDraft, DEFAULT_SETTINGS.monitor.autoDraft),
      maxDraftsPerRun: int(monitor.maxDraftsPerRun, DEFAULT_SETTINGS.monitor.maxDraftsPerRun, 0, 20),
      draftMinPriority: oneOf(
        monitor.draftMinPriority,
        DRAFT_PRIORITIES,
        DEFAULT_SETTINGS.monitor.draftMinPriority,
      ),
      analyzeMarketing: bool(monitor.analyzeMarketing, DEFAULT_SETTINGS.monitor.analyzeMarketing),
      tagging: bool(monitor.tagging, DEFAULT_SETTINGS.monitor.tagging),
    },
    brief: {
      enabled: bool(brief.enabled ?? oldBrief.enabled, DEFAULT_SETTINGS.brief.enabled),
      hour: int(brief.hour ?? oldBrief.hour, DEFAULT_SETTINGS.brief.hour, 0, 23),
      updateHourly: bool(brief.updateHourly, DEFAULT_SETTINGS.brief.updateHourly),
      notify: bool(brief.notify, DEFAULT_SETTINGS.brief.notify),
    },
    profile: {
      tone: oneOf(profile.tone, TONES, DEFAULT_SETTINGS.profile.tone),
      signOff: str(profile.signOff),
      language: str(profile.language, DEFAULT_SETTINGS.profile.language) || 'auto',
    },
  }
}

/** Deep-merges a patch over already-normalised settings, so saving one panel keeps the others. */
export function mergeSettings(base, patch = {}) {
  const p = pick(patch)
  const routes = { ...base.routes }
  for (const task of TASKS)
    routes[task] = { ...base.routes?.[task], ...pick(p.routes?.[task]) }
  return {
    ...base,
    ...p,
    routes,
    providers: Array.isArray(p.providers) ? p.providers : base.providers,
    monitor: { ...base.monitor, ...pick(p.monitor) },
    brief: { ...base.brief, ...pick(p.brief) },
    profile: { ...base.profile, ...pick(p.profile) },
  }
}

/** True when at least one configured provider can be called. */
export const providerConfigured = (s) => Boolean(s?.providers?.some(providerUsable))

/** Settings a monitor run needs, or a readable reason why it cannot start. */
export function monitorBlockedReason(settings) {
  if (!settings?.providers?.length)
    return 'Add an AI provider in Provider settings first.'
  if (!settings.providers.some(providerUsable))
    return 'Finish the provider setup: URL, model and API key (or a localhost server).'
  const primary =
    settings.providers.find(providerUsable) ??
    settings.providers.find((p) => p.id === settings.defaultProviderId) ??
    settings.providers[0]
  if (!/^https:\/\//.test(primary.baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(primary.baseUrl))
    return 'The API URL must use https (http is allowed only for localhost).'
  return null
}

/** Deep, explicit copy for storage; keeps unknown legacy fields out. */
export function settingsForStorage(settings) {
  return normalizeSettings(settings)
}
