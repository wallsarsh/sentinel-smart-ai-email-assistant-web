/**
 * A small Prometheus registry. Labels are chosen by the code, never copied from requests: routes are
 * reduced to patterns from an allow-list, methods and statuses to fixed sets, job names to the known
 * jobs. No user id, address, message id or content can become a label, and the number of series is capped.
 */

const MAX_SERIES = 300
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')

type Labels = Record<string, string>
const key = (l: Labels) =>
  Object.keys(l)
    .sort()
    .map((k) => `${k}="${esc(l[k]!)}"`)
    .join(',')

class Family {
  readonly series = new Map<string, number>()
  constructor(
    readonly name: string,
    readonly help: string,
    readonly type: 'counter' | 'gauge',
  ) {}
  /** Past the cap, new label sets are counted under {overflow="true"} instead of growing memory. */
  private slot(l: Labels) {
    const k = key(l)
    if (this.series.has(k) || this.series.size < MAX_SERIES) return k
    return 'overflow="true"'
  }
  inc(l: Labels = {}, by = 1) {
    const k = this.slot(l)
    this.series.set(k, (this.series.get(k) ?? 0) + by)
  }
  set(l: Labels, v: number) {
    this.series.set(this.slot(l), v)
  }
  clear() {
    this.series.clear()
  }
}

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

class Histogram {
  readonly series = new Map<string, { counts: number[]; sum: number; n: number }>()
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  observe(l: Labels, seconds: number) {
    let k = key(l)
    if (!this.series.has(k) && this.series.size >= MAX_SERIES) k = 'overflow="true"'
    const s = this.series.get(k) ?? { counts: BUCKETS.map(() => 0), sum: 0, n: 0 }
    BUCKETS.forEach((b, i) => {
      if (seconds <= b) s.counts[i]!++
    })
    s.sum += seconds
    s.n++
    this.series.set(k, s)
  }
}

export function createMetrics() {
  const counters = new Map<string, Family>()
  const hists = new Map<string, Histogram>()
  const fam = (name: string, help: string, type: 'counter' | 'gauge') => {
    let f = counters.get(name)
    if (!f) counters.set(name, (f = new Family(name, help, type)))
    return f
  }
  return {
    counter: (name: string, help: string) => fam(name, help, 'counter'),
    gauge: (name: string, help: string) => fam(name, help, 'gauge'),
    histogram(name: string, help: string) {
      let h = hists.get(name)
      if (!h) hists.set(name, (h = new Histogram(name, help)))
      return h
    },
    /** Prometheus text exposition format 0.0.4. */
    render(): string {
      const out: string[] = []
      for (const f of counters.values()) {
        out.push(`# HELP ${f.name} ${f.help}`, `# TYPE ${f.name} ${f.type}`)
        for (const [k, v] of f.series) out.push(`${f.name}${k ? `{${k}}` : ''} ${v}`)
      }
      for (const h of hists.values()) {
        out.push(`# HELP ${h.name} ${h.help}`, `# TYPE ${h.name} histogram`)
        for (const [k, s] of h.series) {
          const sep = k ? `${k},` : ''
          BUCKETS.forEach((b, i) => out.push(`${h.name}_bucket{${sep}le="${b}"} ${s.counts[i]}`))
          out.push(
            `${h.name}_bucket{${sep}le="+Inf"} ${s.n}`,
            `${h.name}_sum${k ? `{${k}}` : ''} ${s.sum}`,
            `${h.name}_count${k ? `{${k}}` : ''} ${s.n}`,
          )
        }
      }
      return `${out.join('\n')}\n`
    },
  }
}
export type Metrics = ReturnType<typeof createMetrics>

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
export const methodLabel = (m: string) => (METHODS.has(m.toUpperCase()) ? m.toUpperCase() : 'OTHER')
export const statusLabel = (s: number) =>
  s >= 100 && s < 600 ? `${Math.floor(s / 100)}xx` : 'other'

/**
 * Every fixed word that appears in a route under server/api (a test compares this list with the folder, so
 * a new route cannot be forgotten). Anything not on it, such as an id, a token or user-controlled text,
 * becomes `:id` and never reaches a label.
 */
export const ROUTE_WORDS = new Set(
  `account accounts actions ai audit auth authorize background begin bench brief
  callback catch-up clear-cache config confirm connect consent counts delete devices disable discover done drafts
  events export folders generate google heads health history imap inbox key log login logout me message messages
  metrics mfa microsoft password password-reset password-reset-confirm prepare prices profile providers push read
  ready reconcile recovery refresh reply-info revoke-others routes rules search send sessions settings signup snooze
  status step-up subscribe test triage undo unsubscribe usage`.split(/\s+/),
)

/**
 * Reduces a URL path to a bounded pattern: `/api/messages/<id>/triage` becomes `/api/messages/:id/triage`.
 * The first segment must be a known word (else `/api/other`); later ones are kept only when known, up to four
 * segments in all. Pages are one label.
 */
export function routeLabel(path: string): string {
  if (!path.startsWith('/api/')) return path.startsWith('/_nuxt/') ? 'asset' : 'page'
  const parts = path.split('?')[0]!.split('/').filter(Boolean).slice(1, 5) // after "api"
  if (!parts.length || !ROUTE_WORDS.has(parts[0]!)) return '/api/other'
  return ['/api', ...parts.map((p, i) => (i === 0 || ROUTE_WORDS.has(p) ? p : ':id'))]
    .reduce<string[]>((acc, p) => (p === ':id' && acc.at(-1) === ':id' ? acc : [...acc, p]), [])
    .join('/')
}

export const metrics = createMetrics()
export const httpRequests = metrics.counter(
  'sentinel_http_requests_total',
  'HTTP requests by method, route pattern and status class',
)
export const httpDuration = metrics.histogram(
  'sentinel_http_request_duration_seconds',
  'HTTP request duration by route pattern',
)
export const errorReports = metrics.counter(
  'sentinel_error_reports_total',
  'Error reports by result',
)
export const jobQueueDepth = metrics.gauge('sentinel_job_queue_jobs', 'Jobs by name and status')
export const jobOldestQueuedSeconds = metrics.gauge(
  'sentinel_job_oldest_queued_seconds',
  'Age of the oldest queued job by name',
)
export const processUptime = metrics.gauge(
  'sentinel_process_uptime_seconds',
  'Seconds since the process started',
)
export const processMemory = metrics.gauge(
  'sentinel_process_resident_memory_bytes',
  'Resident memory',
)

/** Records one finished request. */
export function recordRequest(method: string, path: string, status: number, seconds: number) {
  const route = routeLabel(path)
  httpRequests.inc({ method: methodLabel(method), route, status: statusLabel(status) })
  httpDuration.observe({ route }, seconds)
}

/** Job names that may be labels; anything else is "other". */
const JOB_NAMES = new Set(['mail.check', 'mail.sync', 'retention.run'])
export const jobLabel = (n: string) => (JOB_NAMES.has(n) ? n : 'other')
