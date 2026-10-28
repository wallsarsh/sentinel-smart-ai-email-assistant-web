import { scrub } from '../../shared/scrub'

export type ErrorReport = {
  name: string
  message: string
  /** Top frames as `function (file:line)`, relative to the app, never with query strings or user paths. */
  frames: string[]
  route: string
  at: string
  build: string
}

/** Removes everything that could carry mail, people or secrets from an error before it leaves the process. */
export function scrubError(
  err: unknown,
  o: { route: string; build: string; now: Date },
): ErrorReport {
  const e = err instanceof Error ? err : new Error(String(err))
  const frames = (err instanceof Error ? (e.stack ?? '') : '')
    .split('\n')
    .slice(1, 9)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('at '))
    .map((l) =>
      scrub(
        l
          .replace(/^at /, '')
          .replace(
            /\(?(?:file:\/\/)?\/[^():]*?\/(node_modules\/[^():]+|server\/[^():]+|app\/[^():]+|shared\/[^():]+|worker\/[^():]+)/g,
            (_m, p: string) => `(${p}`,
          )
          .replace(/\/(?:home|Users|root|app)\/[^\s():]+/g, '[path]')
          .replace(/\?[^\s):]*/g, ''),
      ),
    )
  return {
    name: scrub(e.name).slice(0, 60),
    message: scrub(e.message).slice(0, 300),
    frames,
    route: o.route,
    at: o.now.toISOString(),
    build: o.build,
  }
}

export type ReporterDeps = {
  /** Where reports go. Unset means reporting is off. */
  url: string | undefined
  post(url: string, body: string): Promise<void>
  build: string
  now?: () => Date
  /** Whether this user agreed to crash reports. System errors (no user) are covered by the operator's choice of [url]. */
  userOptedIn(userId: string): Promise<boolean>
}

/** Opt-in error reporting: nothing is sent unless the operator set a URL and, for user-caused errors, the user agreed. */
export function errorReporter(d: ReporterDeps) {
  const seen = new Map<string, number>()
  return {
    /** Returns true when a report was sent. Never throws. Identical errors are sent at most once a minute. */
    async report(err: unknown, ctx: { route: string; userId?: string }): Promise<boolean> {
      try {
        if (!d.url) return false
        if (ctx.userId && !(await d.userOptedIn(ctx.userId))) return false
        const report = scrubError(err, {
          route: ctx.route,
          build: d.build,
          now: (d.now ?? (() => new Date()))(),
        })
        const k = `${report.name}|${report.message}|${report.frames[0] ?? ''}`
        const t = Date.parse(report.at)
        if (t - (seen.get(k) ?? 0) < 60_000) return false
        seen.set(k, t)
        if (seen.size > 200) seen.delete(seen.keys().next().value!)
        await d.post(d.url, JSON.stringify(report))
        return true
      } catch {
        return false
      }
    },
  }
}
