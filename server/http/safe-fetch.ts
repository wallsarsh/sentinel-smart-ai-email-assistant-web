import { Agent, fetch as undiciFetch } from 'undici'
import { scrub } from '../../shared/scrub'
import {
  SsrfError,
  checkUrl,
  isPublicAddress,
  systemResolver,
  type Resolver,
  type UrlPolicy,
} from './ssrf'

export type SafeFetchOptions = {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  maxBytes?: number
  /** Retries apply to idempotent methods only (GET/HEAD). */
  retries?: number
  maxRedirects?: number
  policy?: UrlPolicy
  resolver?: Resolver
  sleep?: (ms: number) => Promise<void>
}

export type SafeResponse = { status: number; headers: Headers; text: string }

const IDEMPOTENT = new Set(['GET', 'HEAD'])
const REDIRECT = new Set([301, 302, 303, 307, 308])
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Fetch for URLs that a user can influence (AI base URL, IMAP autodiscovery):
 * validates the target and every redirect, pins the connection to the vetted
 * addresses so DNS cannot change between check and connect, caps time and size,
 * never follows redirects blindly, and retries only idempotent requests.
 */
export async function safeFetch(rawUrl: string, o: SafeFetchOptions = {}): Promise<SafeResponse> {
  const method = (o.method ?? 'GET').toUpperCase()
  const resolver = o.resolver ?? systemResolver
  const maxRedirects = o.maxRedirects ?? 3
  const retries = IDEMPOTENT.has(method) ? (o.retries ?? 2) : 0
  const sleep = o.sleep ?? defaultSleep
  let url = rawUrl
  let hops = 0

  for (let attempt = 0; ; attempt++) {
    const { url: u, addresses } = await checkUrl(url, o.policy, resolver)
    // Connect only to vetted addresses; re-check at connect time as well.
    const dispatcher = new Agent({
      connect: {
        lookup: (_host, _opts, cb) => {
          const ip = addresses[0]!
          if (!isPublicAddress(ip)) return cb(new SsrfError('private_address'), '', 4)
          cb(null, [{ address: ip, family: ip.includes(':') ? 6 : 4 }] as never, undefined as never)
        },
      },
    })
    try {
      const res = await undiciFetch(u, {
        method,
        headers: o.headers,
        body: o.body,
        redirect: 'manual',
        dispatcher,
        signal: AbortSignal.timeout(o.timeoutMs ?? 10_000),
      })
      if (REDIRECT.has(res.status)) {
        const loc = res.headers.get('location')
        await res.body?.cancel()
        if (!loc || ++hops > maxRedirects) throw new SsrfError('too_many_redirects')
        url = new URL(loc, u).toString()
        attempt--
        continue
      }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await res.body?.cancel()
        await sleep(200 * 2 ** attempt)
        continue
      }
      return {
        status: res.status,
        headers: res.headers as unknown as Headers,
        text: await readCapped(res, o.maxBytes ?? 2_000_000),
      }
    } catch (e) {
      if (e instanceof SsrfError) throw e
      if (attempt < retries) {
        await sleep(200 * 2 ** attempt)
        continue
      }
      throw new Error(`request failed: ${scrub(e instanceof Error ? e.message : 'error')}`, {
        cause: e,
      })
    } finally {
      void dispatcher.close()
    }
  }
}

async function readCapped(
  res: Awaited<ReturnType<typeof undiciFetch>>,
  max: number,
): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > max) {
      await reader.cancel()
      throw new Error('response too large')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export type SafeStreamOptions = Pick<
  SafeFetchOptions,
  'method' | 'headers' | 'body' | 'policy' | 'resolver'
> & {
  /** Time allowed until response headers arrive. */
  connectTimeoutMs?: number
  /** Aborting closes the upstream connection. */
  signal?: AbortSignal
}
export type SafeStream = {
  status: number
  headers: Headers
  body: ReadableStream<Uint8Array> | null
  close(): void
}

/**
 * Like [safeFetch] but hands back the response body as a stream (for AI token
 * streaming). Same address vetting and pinning; redirects are refused and
 * nothing is retried, since a half-delivered stream cannot be replayed.
 */
export async function safeStream(rawUrl: string, o: SafeStreamOptions = {}): Promise<SafeStream> {
  const { url, addresses } = await checkUrl(rawUrl, o.policy, o.resolver ?? systemResolver)
  const dispatcher = new Agent({
    connect: {
      lookup: (_h, _o, cb) => {
        const ip = addresses[0]!
        if (!isPublicAddress(ip)) return cb(new SsrfError('private_address'), '', 4)
        cb(null, [{ address: ip, family: ip.includes(':') ? 6 : 4 }] as never, undefined as never)
      },
    },
  })
  const ctl = new AbortController()
  const abort = () => ctl.abort()
  o.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, o.connectTimeoutMs ?? 15_000)
  const close = () => {
    clearTimeout(timer)
    o.signal?.removeEventListener('abort', abort)
    ctl.abort()
    void dispatcher.close()
  }
  try {
    const res = await undiciFetch(url, {
      method: o.method ?? 'POST',
      headers: o.headers,
      body: o.body,
      redirect: 'manual',
      dispatcher,
      signal: ctl.signal,
    })
    clearTimeout(timer)
    if (REDIRECT.has(res.status)) {
      close()
      throw new SsrfError('too_many_redirects')
    }
    return {
      status: res.status,
      headers: res.headers as unknown as Headers,
      body: res.body as never,
      close,
    }
  } catch (e) {
    close()
    if (e instanceof SsrfError) throw e
    throw new Error(`request failed: ${scrub(e instanceof Error ? e.message : 'error')}`, {
      cause: e,
    })
  }
}
