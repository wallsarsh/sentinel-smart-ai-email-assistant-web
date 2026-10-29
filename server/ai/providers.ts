import { z } from 'zod'
import type { Db } from '../db/client'
import { forUser } from '../repos'
import type { ProviderRow } from '../repos/ai-providers'
import { secretStoreFor, type KekRing } from '../security/secret-store'
import { err, ok, type Result } from '../../shared/errors/result'
import type { AppFailure } from '../../shared/errors/failure'
import { anthropicProvider, ANTHROPIC_BASE } from './anthropic'
import { checkBaseUrl, openAiProvider, OPENAI_BASE } from './openai/adapter'
import { PRESETS } from './presets'
import type { AiHttp, AiKind, AiProvider } from './types'

export const keySecret = (providerId: string) => `ai:${providerId}`
export const MAX_PROVIDERS = 10

/** What the API may show: the key appears only as a hint with its last four characters. */
export type ProviderView = {
  id: string
  kind: AiKind
  displayName: string
  baseUrl: string
  presetId: string | null
  status: string
  consentGivenAt: Date | null
  models: string[]
  options: Record<string, unknown>
  keyHint: string
}

const mask = (key: string) => `…${key.slice(-4)}`
const optionsSchema = z
  .object({
    structured: z.enum(['strict', 'json_object', 'prompt']).optional(),
    authHeader: z.enum(['authorization', 'api-key']).optional(),
    tokensParam: z.enum(['max_completion_tokens', 'max_tokens']).optional(),
  })
  .strict()

const newProvider = z.object({
  presetId: z.enum(PRESETS.map((p) => p.id) as [string, ...string[]]),
  displayName: z.string().trim().min(1).max(60).optional(),
  baseUrl: z.string().max(300).optional(),
  apiKey: z.string().min(8).max(500),
  model: z.string().trim().min(1).max(200).optional(),
  options: optionsSchema.optional(),
})

export type AiProviderDeps = {
  db: Db
  ring: KekRing
  http?: AiHttp
  resolver?: Parameters<typeof checkBaseUrl>[1]
}

export function aiProviderService(d: AiProviderDeps) {
  const repos = (u: string) => forUser(d.db, u)
  const store = (u: string) => secretStoreFor(d.db, u, d.ring)

  const view = (r: ProviderRow): ProviderView => {
    const o = (r.optionsJson ?? {}) as Record<string, unknown>
    const { keyHint, ...options } = o
    return {
      id: r.id,
      kind: r.kind,
      displayName: r.displayName,
      baseUrl: r.baseUrl,
      presetId: r.presetId,
      status: r.status,
      consentGivenAt: r.consentGivenAt,
      models: (r.modelsJson as string[]) ?? [],
      options,
      keyHint: String(keyHint ?? ''),
    }
  }

  /** Builds the live adapter. Server-side only: this is the one place a key is decrypted for AI calls. */
  async function instance(
    userId: string,
    row: ProviderRow,
  ): Promise<Result<AiProvider, AppFailure>> {
    const key = await store(userId).get(keySecret(row.id))
    if (!key) return err({ kind: 'auth', problem: 'invalid_credentials', code: 'no_key' })
    const options = optionsSchema.safeParse(row.optionsJson).data ?? {}
    return ok(
      row.kind === 'anthropic'
        ? anthropicProvider({ apiKey: key, baseUrl: row.baseUrl || ANTHROPIC_BASE, http: d.http })
        : openAiProvider({
            kind: row.kind,
            apiKey: key,
            baseUrl: row.baseUrl || OPENAI_BASE,
            options,
            http: d.http,
          }),
    )
  }

  async function refreshModels(userId: string, id: string): Promise<Result<string[], AppFailure>> {
    const row = await repos(userId).ai.get(id)
    if (!row) return err({ kind: 'not_found' })
    const p = await instance(userId, row)
    if (!p.ok) return p
    const models = await p.value.listModels()
    if (!models.ok) {
      await repos(userId).ai.update(id, {
        status: models.error.kind === 'auth' ? 'bad_key' : 'unreachable',
      })
      return models
    }
    await repos(userId).ai.update(id, { modelsJson: models.value, status: 'ok' })
    return models
  }

  return {
    list: async (userId: string) => (await repos(userId).ai.list()).map(view),
    instance,
    refreshModels,

    async create(userId: string, input: unknown): Promise<Result<ProviderView, AppFailure>> {
      const p = newProvider.safeParse(input)
      if (!p.success)
        return err({
          kind: 'validation',
          field: String(p.error.issues[0]?.path[0] ?? ''),
          code: 'invalid',
        })
      const preset = PRESETS.find((x) => x.id === p.data.presetId)!
      if ((await repos(userId).ai.list()).length >= MAX_PROVIDERS)
        return err({ kind: 'validation', field: 'provider', code: 'limit_reached' })
      let baseUrl: string = preset.baseUrl
      if (preset.editableUrl) {
        const u = await checkBaseUrl(p.data.baseUrl ?? '', d.resolver)
        if (!u.ok) return u
        baseUrl = u.value
      }
      const row = await repos(userId).ai.create({
        kind: preset.kind,
        displayName: p.data.displayName ?? preset.name,
        baseUrl,
        presetId: preset.id,
        optionsJson: { ...p.data.options, keyHint: mask(p.data.apiKey) },
      })
      await store(userId).put(keySecret(row.id), p.data.apiKey)
      // The first model the user names becomes the default for every task, so a new provider works at once.
      if (p.data.model && !(await repos(userId).ai.routes()).some((r) => r.task === 'default'))
        await repos(userId).ai.setRoutes('default', [
          { providerId: row.id, model: p.data.model, paramsJson: {} },
        ])
      await refreshModels(userId, row.id) // status reflects whether the key works; failure is not fatal
      return ok(view((await repos(userId).ai.get(row.id))!))
    },

    /** Replaces the key without touching routes, consent or settings. */
    async replaceKey(
      userId: string,
      id: string,
      apiKey: unknown,
    ): Promise<Result<ProviderView, AppFailure>> {
      const k = z.string().min(8).max(500).safeParse(apiKey)
      if (!k.success) return err({ kind: 'validation', field: 'apiKey', code: 'invalid' })
      const row = await repos(userId).ai.get(id)
      if (!row) return err({ kind: 'not_found' })
      await store(userId).put(keySecret(id), k.data)
      await repos(userId).ai.update(id, {
        optionsJson: { ...(row.optionsJson as object), keyHint: mask(k.data) },
      })
      await refreshModels(userId, id)
      return ok(view((await repos(userId).ai.get(id))!))
    },

    async update(
      userId: string,
      id: string,
      input: unknown,
    ): Promise<Result<ProviderView, AppFailure>> {
      const p = z
        .object({
          displayName: z.string().trim().min(1).max(60).optional(),
          options: optionsSchema.optional(),
        })
        .safeParse(input)
      if (!p.success)
        return err({
          kind: 'validation',
          field: String(p.error.issues[0]?.path[0] ?? ''),
          code: 'invalid',
        })
      const row = await repos(userId).ai.get(id)
      if (!row) return err({ kind: 'not_found' })
      const hint = (row.optionsJson as { keyHint?: string }).keyHint
      const r = await repos(userId).ai.update(id, {
        ...(p.data.displayName ? { displayName: p.data.displayName } : {}),
        ...(p.data.options ? { optionsJson: { ...p.data.options, keyHint: hint } } : {}),
      })
      return ok(view(r!))
    },

    /** Records or withdraws the user's consent for this provider. The gateway reads it on every call. */
    async setConsent(
      userId: string,
      id: string,
      given: boolean,
      now = new Date(),
    ): Promise<Result<ProviderView, AppFailure>> {
      const r = await repos(userId).ai.update(id, { consentGivenAt: given ? now : null })
      return r ? ok(view(r)) : err({ kind: 'not_found' })
    },

    async remove(userId: string, id: string): Promise<Result<undefined, AppFailure>> {
      if (!(await repos(userId).ai.remove(id))) return err({ kind: 'not_found' })
      await store(userId).delete(keySecret(id))
      return ok(undefined)
    },
  }
}
