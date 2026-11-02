import { zoneOffset, PromptBuilder } from '../../packages/core/src/prompts/builder'
import { draftPrompt } from '../../packages/core/src/prompts/registry'
import { structuredCall } from '../../packages/core/src/ai/structured'
import { openAiProvider } from '../../packages/core/src/ai/openai'
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

const provider = (s, fetchImpl) =>
  openAiProvider({
    kind: 'openai_compatible',
    apiKey: s.apiKey,
    baseUrl: s.baseUrl.replace(/\/+$/, ''),
    // Local servers (Ollama, LM Studio) only know max_tokens; OpenAI proper accepts both.
    options: { tokensParam: 'max_tokens' },
    http: fetchHttp(fetchImpl),
  })

/** Triage for several messages in one call. Returns a Map of providerMessageId → result. */
export async function analyzeBatch(settings, messages, ctx, fetchImpl) {
  const prompt = builder().buildTriage(
    messages.map((m) => ({ messageId: String(m.providerMessageId), message: m })),
    ctx,
  )
  const p = provider(settings, fetchImpl)
  const base = 300 * messages.length + 900 // generous: thinking models spend part of the budget before answering
  const res = await structuredCall(async (turn) => {
    const r = await p.complete({
      model: settings.model,
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
  const p = provider(settings, fetchImpl)
  return async (req) => {
    const r = await p.complete({ ...req, model: settings.model })
    return r.ok ? { ok: true, value: { text: r.value.text, stop: r.value.stop } } : r
  }
}

/** A reply body, as plain text. `thread` is the newest-last list of MailMessage. */
export async function draftReply(settings, thread, ctx, request, fetchImpl) {
  const prompt = builder().buildDraft(
    thread.map((m, i) => ({ messageId: String(m.providerMessageId ?? i), message: m })),
    ctx,
    request,
  )
  const r = await provider(settings, fetchImpl).complete({
    model: settings.model,
    system: draftPrompt.system,
    user: prompt.text,
    maxTokens: 1500,
    temperature: 0.4,
  })
  if (!r.ok) throw new Error(describe(r.error))
  if (!r.value.text.trim()) throw new Error('The AI returned no text.')
  return r.value.text.trim()
}

export function describe(f) {
  switch (f.kind) {
    case 'auth':
      return 'The provider rejected the API key.'
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
