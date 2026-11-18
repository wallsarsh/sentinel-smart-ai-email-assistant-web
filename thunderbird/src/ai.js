import { zoneOffset, PromptBuilder } from '../../packages/core/src/prompts/builder'
import { draftPrompt } from '../../packages/core/src/prompts/registry'
import { structuredCall } from '../../packages/core/src/ai/structured'
import { openAiProvider } from '../../packages/core/src/ai/openai'
import { anthropicProvider } from '../../packages/core/src/ai/anthropic'
import { fetchHttp } from '../../packages/core/src/ai/http'
import { normalizeAnalysis } from './analysis.js'
import { assistantPrompt } from './prompts.js'
import { selfFrom } from './mail.js'

// One builder shape for every call: the compact envelope sends only what the model can use.
const builder = () => new PromptBuilder({ compact: true })

export function userContext(accounts, now = new Date(), profile = {}, rules = []) {
  const self = selfFrom(accounts)
  const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return {
    name: profile.name || self.name,
    timezoneName,
    offsetAt: (d) => zoneOffset(timezoneName, d),
    now,
    selfAddresses: self.addresses,
    signOff: profile.signOff || undefined,
    styleNotes: profile.styleNotes || undefined,
    language: profile.language && profile.language !== 'auto' ? profile.language : undefined,
    vipSenders: rules.filter((r) => r.kind === 'important').map((r) => r.pattern),
    senderHints: rules
      .filter((r) => r.kind !== 'normal')
      .map((r) => `${r.pattern} → ${r.kind}`),
  }
}

/** Legacy single-provider settings are still accepted, so upgrades never lose a working setup. */
function providersOf(settings) {
  if (settings?.providers?.length) return settings.providers
  if (settings?.baseUrl || settings?.apiKey || settings?.model)
    return [
      {
        id: 'legacy',
        name: 'Default provider',
        kind: 'openai_compatible',
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
      },
    ]
  return []
}

/** Resolve the provider and model configured for a task. */
export function resolveRoute(settings, task = 'triage') {
  const providers = providersOf(settings)
  if (!providers.length) throw new Error('Add an AI provider in Provider settings first.')
  const route = settings?.routes?.[task] ?? {}
  const provider =
    providers.find((p) => p.id === route.providerId) ??
    providers.find((p) => p.id === settings?.defaultProviderId) ??
    providers[0]
  const model = route.model || provider.model
  if (!provider.baseUrl) throw new Error('Set the provider URL in Provider settings.')
  if (!model) throw new Error('Choose a model for this task in Provider settings.')
  if (!provider.apiKey && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(provider.baseUrl))
    throw new Error('Set the provider API key in Provider settings.')
  return { provider, model }
}

export function providerFor(provider, fetchImpl) {
  const http = fetchHttp(fetchImpl)
  if (provider.kind === 'anthropic')
    return anthropicProvider({
      apiKey: provider.apiKey,
      baseUrl: (provider.baseUrl || 'https://api.anthropic.com').replace(/\/v1\/?$/, ''),
      // Add-ons are a browser origin; Anthropic needs its explicit browser-access header.
      browser: true,
      http,
    })
  if (provider.kind === 'openai')
    return openAiProvider({
      kind: 'openai',
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl.replace(/\/+$/, ''),
      http,
    })
  return openAiProvider({
    kind: 'openai_compatible',
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl.replace(/\/+$/, ''),
    // Local servers (Ollama, LM Studio) only know max_tokens; OpenAI proper accepts both.
    options: { tokensParam: 'max_tokens' },
    http,
  })
}

/** Triage for several messages in one call. Returns a Map of providerMessageId → result. */
export async function analyzeBatch(settings, messages, ctx, fetchImpl) {
  const prompt = builder().buildTriage(
    messages.map((m) => ({ messageId: String(m.providerMessageId), message: m })),
    ctx,
  )
  const { provider, model } = resolveRoute(settings, 'triage')
  const p = providerFor(provider, fetchImpl)
  const base = 300 * messages.length + 900 // generous: thinking models spend part of the budget before answering
  const res = await structuredCall(async (turn) => {
    const r = await p.complete({
      model,
      system: assistantPrompt.system,
      user:
        turn.kind === 'repair'
          ? `${prompt.text}\n\n<previous_output>\n${turn.invalid}\n</previous_output>\n${turn.prompt}`
          : prompt.text,
      maxTokens: turn.kind === 'retry_longer' ? base * 3 : base,
      schema: assistantPrompt.schema,
    })
    return r.ok ? { ok: true, value: { text: r.value.text, stop: r.value.stop } } : r
  }, assistantPrompt.schema.schema)
  if (!res.ok) throw new Error(describe(res.error))
  const out = new Map()
  for (const item of res.value.results ?? []) {
    const id = prompt.idMap[item.id]
    if (id && !out.has(id)) out.set(id, normalizeAnalysis(item))
  }
  return out
}

/** One message: priority, summary, whether it needs a reply, and action items. */
export async function analyze(settings, message, ctx, fetchImpl) {
  const out = await analyzeBatch(settings, [message], ctx, fetchImpl)
  const item = out.get(String(message.providerMessageId))
  if (!item) throw new Error('The AI returned no result.')
  return item
}

/** The model call the shared brief runner uses. */
export function briefAsk(settings, fetchImpl) {
  const { provider, model } = resolveRoute(settings, 'brief')
  const p = providerFor(provider, fetchImpl)
  return async (req) => {
    const r = await p.complete({ ...req, model })
    return r.ok ? { ok: true, value: { text: r.value.text, stop: r.value.stop } } : r
  }
}

function draftPromptFor(thread, ctx, request) {
  return builder().buildDraft(
    thread.map((m, i) => ({ messageId: String(m.providerMessageId ?? i), message: m })),
    ctx,
    request,
  )
}

/** A completed reply body, as plain text. `thread` is the newest-last list of MailMessage. */
export async function draftReply(settings, thread, ctx, request, fetchImpl) {
  const prompt = draftPromptFor(thread, ctx, request)
  const { provider, model } = resolveRoute(settings, 'draft')
  const r = await providerFor(provider, fetchImpl).complete({
    model,
    system: draftPrompt.system,
    user: prompt.text,
    maxTokens: 1500,
    temperature: 0.4,
  })
  if (!r.ok) throw new Error(describe(r.error))
  if (!r.value.text.trim()) throw new Error('The AI returned no text.')
  return r.value.text.trim()
}

/**
 * Streamed reply body. `onDelta(delta, full)` is called as text arrives; returns the full text.
 * Falls back to one completion if the provider adapter has no streaming support.
 */
export async function draftReplyStream(
  settings,
  thread,
  ctx,
  request,
  onDelta,
  fetchImpl,
) {
  const { provider, model } = resolveRoute(settings, 'draft')
  const p = providerFor(provider, fetchImpl)
  if (!p.stream) {
    const text = await draftReply(settings, thread, ctx, request, fetchImpl)
    onDelta?.(text, text)
    return text
  }
  const prompt = draftPromptFor(thread, ctx, request)
  let full = ''
  try {
    for await (const event of p.stream({
      model,
      system: draftPrompt.system,
      user: prompt.text,
      maxTokens: 1500,
      temperature: 0.4,
    })) {
      if (event.type === 'delta') {
        full += event.text
        onDelta?.(event.text, full)
      }
    }
  } catch (e) {
    if (e?.failure) throw new Error(describe(e.failure), { cause: e })
    throw e
  }
  if (!full.trim()) throw new Error('The AI returned no text.')
  return full.trim()
}

/** A short text transformation (proofread/rewrite) using its own task route. */
export async function runTextTask(
  settings,
  task,
  system,
  user,
  { maxTokens = 1500, temperature = 0.2, fetchImpl } = {},
) {
  const { provider, model } = resolveRoute(settings, task)
  const r = await providerFor(provider, fetchImpl).complete({
    model,
    system,
    user,
    maxTokens,
    temperature,
  })
  if (!r.ok) throw new Error(describe(r.error))
  if (!r.value.text.trim()) throw new Error('The AI returned no text.')
  return r.value.text.trim()
}

export function describe(f) {
  switch (f.kind) {
    case 'auth':
      return f.code === 'browser_blocked'
        ? 'Anthropic blocks calls from browser add-ons for this organization, even with a valid key (for example with zero data retention or the Compliance API). Use an OpenAI-compatible provider such as OpenRouter for this account.'
        : 'The provider rejected the API key.'
    case 'rate_limited':
      return 'The provider is rate limiting requests. Try again shortly.'
    case 'network':
      return 'Could not reach the provider. Check the API URL.'
    case 'not_found':
      return 'The provider does not know this URL or model.'
    case 'provider':
      return `The provider answered ${f.status ?? 'with an error'}.`
    case 'ai_output':
      return `The AI answer could not be used (${f.problem}).`
    default:
      return 'The request failed.'
  }
}
