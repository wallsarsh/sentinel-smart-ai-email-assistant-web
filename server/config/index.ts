import { z } from 'zod'

/** Placeholder markers that must never reach production. */
const WEAK = /change-?me|dev-only|example|password|secret123/i

const secret = (min: number, name: string) =>
  z.string().min(min, `${name} must be at least ${min} characters`)

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    BASE_URL: z.url(),
    DATABASE_URL: z
      .string()
      .regex(
        /^(postgres(ql)?|sqlite|file|pglite):/,
        'DATABASE_URL must be a postgres, sqlite or desktop PGlite URL',
      ),
    SESSION_SECRET: secret(32, 'SESSION_SECRET'),
    KEK_BASE64: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'KEK_BASE64 must be exactly 32 bytes, base64',
    }),
    // Key rotation: bump KEK_VERSION when KEK_BASE64 changes and list the older keys as `version:base64,version:base64`.
    KEK_VERSION: z.coerce.number().int().min(1).max(1_000_000).default(1),
    KEK_PREVIOUS: z.string().default(''),
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    MS_CLIENT_ID: z.string().default(''),
    MS_CLIENT_SECRET: z.string().default(''),
    MS_AUTHORITY: z.url().default('https://login.microsoftonline.com/common'),
    VAPID_PUBLIC_KEY: z.string().default(''),
    VAPID_PRIVATE_KEY: z.string().default(''),
    VAPID_SUBJECT: z.string().default('mailto:admin@localhost'),
    SYSTEM_SMTP_URL: z.string().default('smtp://localhost:1025'),
    SYSTEM_MAIL_FROM: z.string().default('Sentinel <no-reply@localhost>'),
    // Observability. Both are off when empty.
    METRICS_TOKEN: z.string().default(''),
    ERROR_REPORT_URL: z.string().default(''),
    // Local testing over http only. Off by default; see .env.example.
    ALLOW_INSECURE_HTTP: z.enum(['true', 'false']).default('false'),
    BUILD_ID: z.string().max(60).default('unknown'),
  })
  .superRefine((v, ctx) => {
    try {
      const prev = parseKekPrevious(v.KEK_PREVIOUS)
      const versions = [v.KEK_VERSION, ...prev.map((k) => k.version)]
      if (new Set(versions).size !== versions.length)
        ctx.addIssue({
          code: 'custom',
          path: ['KEK_PREVIOUS'],
          message: 'KEK versions must be unique',
        })
    } catch (e) {
      ctx.addIssue({ code: 'custom', path: ['KEK_PREVIOUS'], message: (e as Error).message })
    }
    if (v.NODE_ENV !== 'production') return
    if (!v.BASE_URL.startsWith('https://') && v.ALLOW_INSECURE_HTTP !== 'true')
      ctx.addIssue({
        code: 'custom',
        path: ['BASE_URL'],
        message:
          'must be https in production (set ALLOW_INSECURE_HTTP=true only for local testing)',
      })
    for (const k of ['SESSION_SECRET', 'KEK_BASE64'] as const) {
      if (WEAK.test(v[k]) || WEAK.test(Buffer.from(v.KEK_BASE64, 'base64').toString()))
        ctx.addIssue({ code: 'custom', path: [k], message: 'looks like a development placeholder' })
    }
  })

/** `1:base64,2:base64` → keys; each must be 32 bytes. Throws with a message that never contains the key. */
export function parseKekPrevious(raw: string): { version: number; key: Buffer }[] {
  if (!raw.trim()) return []
  return raw.split(',').map((part, i) => {
    const m = /^\s*(\d{1,7}):([A-Za-z0-9+/=_-]+)\s*$/.exec(part)
    if (!m) throw new Error(`KEK_PREVIOUS entry ${i + 1} must look like version:base64`)
    const key = Buffer.from(m[2]!, 'base64')
    if (key.length !== 32) throw new Error(`KEK_PREVIOUS entry ${i + 1} must be 32 bytes`)
    return { version: Number(m[1]), key }
  })
}

export type AppConfig = {
  env: 'development' | 'test' | 'production'
  baseUrl: string
  databaseUrl: string
  sessionSecret: string
  kek: Buffer
  /** Version number stored with data keys wrapped by [kek]. */
  kekVersion: number
  /** Older keys still needed to read data keys that have not been re-wrapped yet. */
  kekPrevious: { version: number; key: Buffer }[]
  google: { clientId: string; clientSecret: string }
  microsoft: { clientId: string; clientSecret: string; authority: string }
  vapid: { publicKey: string; privateKey: string; subject: string }
  systemMail: { smtpUrl: string; from: string }
  /** Bearer token for /api/metrics; empty disables the endpoint. */
  metricsToken: string
  /** Where scrubbed error reports go; empty disables reporting. */
  errorReportUrl: string
  /** Identifies the deployed build in error reports (a version or commit). */
  buildId: string
  /** Local testing over plain http: cookies are not Secure and HSTS / upgrade-insecure-requests are not sent. */
  allowInsecureHttp: boolean
  /** Cookies get the Secure flag. */
  secureCookies: boolean
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid configuration:\n - ${issues.join('\n - ')}`)
  }
}

/** Validates [env]; throws [ConfigError] listing every problem (never the values). */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const r = schema.safeParse(env)
  if (!r.success) {
    throw new ConfigError(
      r.error.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`),
    )
  }
  const v = r.data
  return {
    env: v.NODE_ENV,
    baseUrl: v.BASE_URL.replace(/\/$/, ''),
    databaseUrl: v.DATABASE_URL,
    sessionSecret: v.SESSION_SECRET,
    kek: Buffer.from(v.KEK_BASE64, 'base64'),
    kekVersion: v.KEK_VERSION,
    kekPrevious: parseKekPrevious(v.KEK_PREVIOUS),
    google: { clientId: v.GOOGLE_CLIENT_ID, clientSecret: v.GOOGLE_CLIENT_SECRET },
    microsoft: {
      clientId: v.MS_CLIENT_ID,
      clientSecret: v.MS_CLIENT_SECRET,
      authority: v.MS_AUTHORITY,
    },
    vapid: {
      publicKey: v.VAPID_PUBLIC_KEY,
      privateKey: v.VAPID_PRIVATE_KEY,
      subject: v.VAPID_SUBJECT,
    },
    systemMail: { smtpUrl: v.SYSTEM_SMTP_URL, from: v.SYSTEM_MAIL_FROM },
    metricsToken: v.METRICS_TOKEN,
    errorReportUrl: v.ERROR_REPORT_URL,
    buildId: v.BUILD_ID,
    allowInsecureHttp: v.ALLOW_INSECURE_HTTP === 'true',
    secureCookies: v.NODE_ENV === 'production' && v.ALLOW_INSECURE_HTTP !== 'true',
  }
}

let cached: AppConfig | undefined

/** The process configuration. The only place that reads `process.env`. */
export function useConfig(): AppConfig {
  return (cached ??= loadConfig(process.env))
}

/** For tests. */
export function resetConfigForTests(): void {
  cached = undefined
}

/** Standalone desktop shell (see desktop/): the shell sets these for the bundled runtime it launches. */
export const desktopMode = (): boolean => process.env.SENTINEL_DESKTOP_MODE === 'true'
export const desktopProbe = (): string | undefined => process.env.SENTINEL_DESKTOP_PROBE
export const desktopDbDir = (): string | undefined => process.env.SENTINEL_DESKTOP_DB_DIR
