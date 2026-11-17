// Lists the models a provider offers, so the settings UI can show a dropdown instead of free text.
// Pure apart from the injected fetch; never throws — failures come back as { ok: false, error }.

const ANTHROPIC_VERSION = '2026-10-21'

/** URL and headers for the provider's "list models" endpoint. */
export function modelsRequest(provider) {
  const base = String(provider?.baseUrl ?? '').trim().replace(/\/+$/, '')
  const key = String(provider?.apiKey ?? '').trim()
  if (provider?.kind === 'anthropic') {
    const root = (base || 'https://api.anthropic.com').replace(/\/v1$/, '')
    return {
      url: `${root}/v1/models?limit=1000`,
      headers: {
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
        // Thunderbird is a browser origin; Anthropic rejects browser calls without this.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    }
  }
  return {
    url: `${base}/models`,
    headers: key ? { authorization: `Bearer ${key}` } : {},
  }
}

/** Turns the various list shapes (OpenAI, Anthropic, Ollama, Gemini) into a sorted list of ids. */
export function parseModels(body) {
  const rows = Array.isArray(body) ? body : (body?.data ?? body?.models ?? [])
  if (!Array.isArray(rows)) return []
  const ids = rows
    .map((row) => (typeof row === 'string' ? row : (row?.id ?? row?.name ?? row?.model)))
    .filter((id) => typeof id === 'string' && id.trim())
    .map((id) => id.trim().replace(/^models\//, ''))
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}

const NON_CHAT = /(embed|whisper|tts|moderation|dall-e|image|audio|realtime|transcribe|rerank)/i

/** Hides embedding/speech/image models; falls back to everything if that would leave nothing. */
export function chatModels(ids) {
  const chat = ids.filter((id) => !NON_CHAT.test(id))
  return chat.length ? chat : ids
}

/** Asks the provider for its models. `fetchImpl` defaults to the global fetch. */
export async function listModels(provider, fetchImpl = (...a) => fetch(...a), timeoutMs = 15_000) {
  if (!provider?.baseUrl && provider?.kind !== 'anthropic')
    return { ok: false, error: 'Enter the base URL first.' }
  const { url, headers } = modelsRequest(provider)
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { method: 'GET', headers, signal: ctl.signal })
    if (res.status === 401 || res.status === 403) {
      const body = typeof res.text === 'function' ? await res.text().catch(() => '') : ''
      if (/CORS requests are not allowed/i.test(body))
        return {
          ok: false,
          error:
            'Anthropic blocks calls from browser add-ons for this organization, even with a valid key (for example with zero data retention or the Compliance API). Use an OpenAI-compatible provider such as OpenRouter for this account.',
        }
      return { ok: false, error: 'The provider rejected the API key.' }
    }
    if (res.status === 404)
      return { ok: false, error: 'This provider does not offer a model list. Enter the model name manually.' }
    if (!res.ok) return { ok: false, error: `The provider answered ${res.status}.` }
    const models = chatModels(parseModels(await res.json()))
    if (!models.length) return { ok: false, error: 'The provider returned no models.' }
    return { ok: true, models }
  } catch (e) {
    return {
      ok: false,
      error:
        e?.name === 'AbortError'
          ? 'The provider took too long to answer.'
          : 'Could not reach the provider. Check the base URL.',
    }
  } finally {
    clearTimeout(timer)
  }
}
