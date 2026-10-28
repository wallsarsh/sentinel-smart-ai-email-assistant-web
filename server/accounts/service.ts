import { z } from 'zod'
import type { Db } from '../db/client'
import { forUser } from '../repos'
import { secretStoreFor, type KekRing } from '../security/secret-store'
import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import { imapSettings as imapSettingsSchema } from '../../shared/domain'
import type { ImapSettings, MailAccount, MailFolder } from '../../shared/domain'
import type { MailProvider } from '../mail/provider'
import { oauthSecretName, type OAuthTokens } from '../mail/oauth/google'

export const ACCOUNT_LIMIT = 5
const imapSecret = (accountId: string) => `imap:${accountId}`

export type AccountDeps = {
  db: Db
  ring: KekRing
  /** Builds an IMAP provider for a credential check or later reads. */
  imapProvider(s: ImapSettings, cred: { username: string; password: string }): Promise<MailProvider>
  smtpTest(
    s: ImapSettings,
    cred: { username: string; password: string },
  ): Promise<Result<undefined, AppFailure>>
  /** Revokes OAuth grants at the provider (best effort). */
  revoke(type: 'gmail' | 'microsoft_graph', t: OAuthTokens): Promise<void>
}

const newImap = z.object({
  email: z.email(),
  displayName: z.string().max(100).default(''),
  password: z.string().min(1).max(500),
  smtpPassword: z.string().min(1).max(500).optional(),
  settings: imapSettingsSchema,
})
export type NewImapAccount = z.input<typeof newImap>

const patchSchema = z.object({
  displayName: z.string().max(100).optional(),
  aiExcluded: z.boolean().optional(),
  color: z.number().int().min(0).max(0xffffff).optional(),
})

const invalid = (field: string, code: string): AppFailure => ({ kind: 'validation', field, code })

/** Public view of an account: never contains credentials or tokens. */
export type AccountView = MailAccount & { color: number; lastSyncAt: Date | null }

export function accountService(d: AccountDeps) {
  const repos = (userId: string) => forUser(d.db, userId)
  const store = (userId: string) => secretStoreFor(d.db, userId, d.ring)

  const view = (
    a: Awaited<ReturnType<ReturnType<typeof repos>['accounts']['get']>> & {},
  ): AccountView => ({
    id: a.id,
    type: a.type,
    email: a.email,
    displayName: a.displayName,
    status: a.status,
    aiExcluded: a.aiExcluded,
    color: a.color,
    lastSyncAt: a.lastSyncAt,
  })

  async function checkCredentials(
    s: ImapSettings,
    password: string,
    smtpPassword: string | undefined,
  ) {
    const provider = await d.imapProvider(s, { username: s.username, password })
    try {
      const r = await provider.testConnection()
      if (!r.ok) return r
    } finally {
      await provider.close()
    }
    return d.smtpTest(s, {
      username: s.smtpUsername ?? s.username,
      password: smtpPassword ?? password,
    })
  }

  return {
    async list(userId: string): Promise<AccountView[]> {
      return (await repos(userId).accounts.list()).map(view)
    },

    /** Tests IMAP and SMTP credentials without saving anything. */
    async testImap(input: unknown): Promise<Result<undefined, AppFailure>> {
      const p = newImap.safeParse(input)
      if (!p.success)
        return err(invalid(String(p.error.issues[0]?.path.join('.') ?? ''), 'invalid'))
      return checkCredentials(p.data.settings, p.data.password, p.data.smtpPassword)
    },

    async addImap(userId: string, input: unknown): Promise<Result<AccountView, AppFailure>> {
      const p = newImap.safeParse(input)
      if (!p.success)
        return err(invalid(String(p.error.issues[0]?.path.join('.') ?? ''), 'invalid'))
      const r = repos(userId)
      const existing = await r.accounts.list()
      if (existing.length >= ACCOUNT_LIMIT) return err(invalid('account', 'limit_reached'))
      const email = p.data.email.toLowerCase()
      if (existing.some((a) => a.email === email)) return err(invalid('email', 'already_connected'))
      const tested = await checkCredentials(p.data.settings, p.data.password, p.data.smtpPassword)
      if (!tested.ok) return tested

      const account = await r.accounts.create({
        type: 'imap',
        email,
        displayName: p.data.displayName || email,
        color: 0x607d8b,
      })
      const { smtpUsername, draftsFolder, sentFolder, serverSavesSent, ...rest } = p.data.settings
      await r.accounts.putImap(account.id, {
        ...rest,
        smtpUsername: smtpUsername ?? null,
        draftsFolder: draftsFolder ?? null,
        sentFolder: sentFolder ?? null,
        serverSavesSent,
      })
      const s = store(userId)
      await s.put(imapSecret(account.id), p.data.password)
      if (p.data.smtpPassword) await s.put(`smtp:${account.id}`, p.data.smtpPassword)

      // Discover folders now so the picker has something to show.
      const provider = await d.imapProvider(p.data.settings, {
        username: p.data.settings.username,
        password: p.data.password,
      })
      try {
        const f = await provider.listFolders()
        if (f.ok)
          await r.mail.upsertFolders(
            account.id,
            f.value.map((x) => ({
              providerId: x.providerId,
              name: x.name,
              role: x.role,
              processed: x.processed,
            })),
          )
      } finally {
        await provider.close()
      }
      return ok(view(account))
    },

    async update(
      userId: string,
      id: string,
      input: unknown,
    ): Promise<Result<AccountView, AppFailure>> {
      const p = patchSchema.safeParse(input)
      if (!p.success)
        return err(invalid(String(p.error.issues[0]?.path.join('.') ?? ''), 'invalid'))
      const row = await repos(userId).accounts.update(id, p.data)
      return row ? ok(view(row)) : err({ kind: 'not_found' })
    },

    async folders(userId: string, id: string): Promise<Result<MailFolder[], AppFailure>> {
      const r = repos(userId)
      if (!(await r.accounts.get(id))) return err({ kind: 'not_found' })
      return ok(
        (await r.mail.listFolders(id)).map((f) => ({
          providerId: f.providerId,
          name: f.name,
          role: f.role,
          processed: f.processed,
        })),
      )
    },

    async chooseFolders(
      userId: string,
      id: string,
      providerIds: unknown,
    ): Promise<Result<undefined, AppFailure>> {
      const p = z.array(z.string().max(500)).max(500).safeParse(providerIds)
      if (!p.success) return err(invalid('folders', 'invalid'))
      const r = repos(userId)
      if (!(await r.accounts.get(id))) return err({ kind: 'not_found' })
      const known = new Set((await r.mail.listFolders(id)).map((f) => f.providerId))
      if (!p.data.every((x) => known.has(x))) return err(invalid('folders', 'unknown_folder'))
      await r.mail.setProcessed(id, p.data)
      return ok(undefined)
    },

    /** Disconnects: revokes the grant, deletes credentials and (by cascade) all mail data for the account. */
    async remove(userId: string, id: string): Promise<Result<undefined, AppFailure>> {
      const r = repos(userId)
      const a = await r.accounts.get(id)
      if (!a) return err({ kind: 'not_found' })
      const s = store(userId)
      if (a.type !== 'imap') {
        const raw = await s.get(oauthSecretName(id))
        if (raw) await d.revoke(a.type, JSON.parse(raw) as OAuthTokens).catch(() => undefined)
      }
      for (const n of [oauthSecretName(id), imapSecret(id), `smtp:${id}`]) await s.delete(n)
      await r.accounts.remove(id)
      return ok(undefined)
    },
  }
}
