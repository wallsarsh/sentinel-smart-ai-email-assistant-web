import pino from 'pino'
import { scrub } from '../../shared/scrub'

/**
 * Fields a log line may carry. Anything else is a type error, so mail
 * content, addresses and secrets cannot be added by accident.
 */
export type LogFields = Partial<{
  requestId: string
  userId: string
  accountId: string
  jobId: string
  jobName: string
  route: string
  method: string
  status: number
  durationMs: number
  count: number
  code: string
  kind: string
  provider: string
  outcome: string
  attempt: number
}>

const ALLOWED = new Set([
  'requestId',
  'userId',
  'accountId',
  'jobId',
  'jobName',
  'route',
  'method',
  'status',
  'durationMs',
  'count',
  'code',
  'kind',
  'provider',
  'outcome',
  'attempt',
])

export type Logger = {
  debug(event: string, fields?: LogFields): void
  info(event: string, fields?: LogFields): void
  warn(event: string, fields?: LogFields): void
  error(event: string, fields?: LogFields, err?: unknown): void
  child(base: LogFields): Logger
}

function cleanFields(fields: LogFields = {}): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(fields)) {
    // Runtime guard in addition to the type: unknown keys are dropped.
    if (!ALLOWED.has(k) || v === undefined) continue
    out[k] = typeof v === 'string' ? scrub(v) : (v as number)
  }
  return out
}

export function createLogger(
  opts: { level?: string; destination?: { write(s: string): void }; base?: LogFields } = {},
): Logger {
  const p = pino(
    { level: opts.level ?? 'info', base: undefined, timestamp: pino.stdTimeFunctions.isoTime },
    opts.destination as pino.DestinationStream | undefined,
  )
  const wrap = (l: pino.Logger, base: LogFields): Logger => ({
    debug: (e, f) => l.debug({ ...cleanFields({ ...base, ...f }) }, scrub(e)),
    info: (e, f) => l.info({ ...cleanFields({ ...base, ...f }) }, scrub(e)),
    warn: (e, f) => l.warn({ ...cleanFields({ ...base, ...f }) }, scrub(e)),
    error: (e, f, err) =>
      l.error(
        {
          ...cleanFields({ ...base, ...f }),
          errType: err instanceof Error ? err.name : undefined,
          errMsg: err instanceof Error ? scrub(err.message.slice(0, 300)) : undefined,
          errCause:
            err instanceof Error && err.cause instanceof Error
              ? scrub(err.cause.message.slice(0, 300))
              : undefined,
        },
        scrub(e),
      ),
    child: (b) => wrap(l, { ...base, ...b }),
  })
  return wrap(p, opts.base ?? {})
}

export const logger = createLogger({ level: 'info' })
