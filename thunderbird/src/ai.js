import { zoneOffset, PromptBuilder } from '../../packages/core/src/prompts/builder'
import { draftPrompt, triagePrompt } from '../../packages/core/src/prompts/registry'
import { structuredCall } from '../../packages/core/src/ai/structured'
import { openAiProvider } from '../../packages/core/src/ai/openai'
import { fetchHttp } from '../../packages/core/src/ai/http'
import { selfFrom } from './mail.js'

// One builder shape for every call: the compact envelope sends only what the model can use.
const builder = () => new PromptBuilder({ compact: true })

export function userContext(accounts, now = new Date()) {
  const self = selfFrom(accounts)
  const timezoneName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return {
    name: self.name,
    timezoneName,
    offsetAt: (d) => zoneOffset(timezoneName, d),
    now,
    selfAddresses: self.addresses,
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

/** One structured call: priority, summary, whether it needs a reply, and action items. */
export async function analyze(settings, message, ctx, fetchImpl) {
  const prompt = builder().buildTriage(
    [{ messageId: String(message.providerMessageId), message }],
    ctx,
  )
  const p = provider(settings, fetchImpl)
  let calls = 0
  const res = await structuredCall(async (turn) => {
    calls++
    const r = await p.complete({
      model: settings.model,
      system: triagePrompt.system,
      user:
        turn.kind === 'repair'
          ? `${prompt.text}\n\n<previous_output>\n${turn.invalid}\n</previous_output>\n${turn.prompt}`
          : prompt.text,
      // Generous on purpose: models that think before answering spend part of this budget on that, and a
      // too-small limit shows up as a cut-off (truncated) answer. Only the tokens actually produced are billed.
      maxTokens: turn.kind === 'retry_longer' ? 4000 : 1200,
      schema: triagePrompt.schema,
    })
    return r.ok ? { ok: true, value: { text: r.value.text, stop: r.value.stop } } : r
  }, triagePrompt.schema.schema)
  if (!res.ok) throw new Error(describe(res.error))
  const item = res.value.results?.[0]
  if (!item) throw new Error('The AI returned no result.')
  return { ...item, calls }
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
