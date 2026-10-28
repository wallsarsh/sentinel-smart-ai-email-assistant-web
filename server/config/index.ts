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
      .regex(/^(postgres(ql)?|sqlite|file):/, 'DATABASE_URL must be a postgres or sqlite URL'),
    SESSION_SECRET: secret(32, 'SESSION_SECRET'),
    KEK_BASE64: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'KEK_BASE64 must be exactly 32 bytes, base64',
    }),
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
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV !== 'production') return
    if (!v.BASE_URL.startsWith('https://'))
      ctx.addIssue({ code: 'custom', path: ['BASE_URL'], message: 'must be https in production' })
    for (const k of ['SESSION_SECRET', 'KEK_BASE64'] as const) {
      if (WEAK.test(v[k]) || WEAK.test(Buffer.from(v.KEK_BASE64, 'base64').toString()))
        ctx.addIssue({ code: 'custom', path: [k], message: 'looks like a development placeholder' })
    }
  })

export type AppConfig = {
  env: 'development' | 'test' | 'production'
  baseUrl: string
  databaseUrl: string
  sessionSecret: string
  kek: Buffer
  google: { clientId: string; clientSecret: string }
  microsoft: { clientId: string; clientSecret: string; authority: string }
  vapid: { publicKey: string; privateKey: string; subject: string }
  systemMail: { smtpUrl: string; from: string }
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
