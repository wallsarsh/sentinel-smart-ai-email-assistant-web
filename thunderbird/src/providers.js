// Provider presets and per-task routing helpers for the Thunderbird assistant.
export const TASKS = ['triage', 'brief', 'draft', 'proofread', 'rewrite']
export const TASK_LABELS = {
  triage: 'Inbox analysis',
  brief: 'Daily brief',
  draft: 'Reply drafts',
  proofread: 'Proofreading',
  rewrite: 'Selection rewrite',
}

export const PROVIDER_PRESETS = [
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyRequired: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    keyRequired: true,
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI-compatible',
    kind: 'openai_compatible',
    baseUrl: '',
    model: '',
    keyRequired: false,
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    kind: 'openai_compatible',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    keyRequired: false,
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (local)',
    kind: 'openai_compatible',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    keyRequired: false,
  },
  {
    id: 'groq',
    name: 'Groq',
    kind: 'openai_compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyRequired: true,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    kind: 'openai_compatible',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    keyRequired: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'openai_compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    keyRequired: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini (OpenAI-compatible)',
    kind: 'openai_compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    keyRequired: true,
  },
]

export const PROVIDER_KINDS = ['openai', 'anthropic', 'openai_compatible']
export const presetById = (id) => PROVIDER_PRESETS.find((p) => p.id === id) ?? null

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const str = (v, fallback = '') => (typeof v === 'string' ? v.trim() : fallback)
const isLocal = (baseUrl) =>
  /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(baseUrl)

export function normalizeProvider(raw = {}) {
  const kind = PROVIDER_KINDS.includes(raw.kind) ? raw.kind : 'openai_compatible'
  return {
    id: str(raw.id) || newId(),
    name: str(raw.name) || 'AI provider',
    kind,
    baseUrl: str(raw.baseUrl).replace(/\/+$/, ''),
    apiKey: str(raw.apiKey),
    model: str(raw.model),
    ...(raw.presetId ? { presetId: raw.presetId } : {}),
  }
}

/** New provider from a preset; everything remains editable after creation. */
export function providerFromPreset(presetId, overrides = {}) {
  const preset = presetById(presetId) ?? presetById('openai-compatible')
  return normalizeProvider({
    name: preset.name,
    kind: preset.kind,
    baseUrl: preset.baseUrl,
    model: preset.model,
    presetId: preset.id,
    ...overrides,
  })
}

export const providerUsable = (p) =>
  Boolean(p?.baseUrl && p?.model && (p.apiKey || isLocal(p.baseUrl)))

/** Default route for each task, based on the first provider that exists. */
export function defaultRoutes(providers = []) {
  const provider = providers[0]
  const out = {}
  for (const task of TASKS)
    out[task] = { providerId: provider?.id ?? '', model: provider?.model ?? '' }
  return out
}

export function normalizeRoutes(saved = {}, providers = []) {
  const first = providers[0]
  const out = {}
  for (const task of TASKS) {
    const r = saved && typeof saved[task] === 'object' ? saved[task] : {}
    const provider =
      providers.find((p) => p.id === r.providerId) ??
      providers.find((p) => p.id === saved?.providerId) ??
      first
    out[task] = {
      providerId: provider?.id ?? '',
      model: str(r.model) || provider?.model || '',
    }
  }
  return out
}

export const sameRoute = (a, b) =>
  Boolean(a && b) && a.providerId === b.providerId && a.model === b.model

export function routeSummary(settings, task) {
  const provider = settings?.providers?.find((p) => p.id === settings.routes?.[task]?.providerId)
  const model = settings?.routes?.[task]?.model || provider?.model || 'not set'
  return `${provider?.name ?? 'No provider'} · ${model}`
}
