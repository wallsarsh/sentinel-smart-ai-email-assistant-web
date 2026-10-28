import type { Db } from '../db/client'
import { forUser } from '../repos'
import { rowToMailMessage } from '../sync/message-mapper'
import { builderOptions } from '../ai/prompts/from-settings'
import { PromptBuilder, type UserContext } from '../ai/prompts/builder'
import { buildUserContext } from '../ai/user-context'
import { PROMPT_VERSIONS, triagePrompt } from '../ai/prompts/registry'
import {
  reconcileIds,
  repairUserMessage,
  structuredCall,
  type Attempt,
  type Caller,
} from '../ai/structured'
import type { aiRouter } from '../ai/router'
import { priorityOf, type Category, type Importance, type Urgency } from '../../shared/domain'
import type { AppFailure } from '../../shared/errors/failure'
import { ok } from '../../shared/errors/result'
import { dueDateResolver } from './due-dates'
import { preFilter } from './prefilter'

export const UNCLASSIFIED_REASON = 'unclassified'
export const AI_EXCLUDED_REASON = 'ai_excluded'

export type TriageRun = { byAi: number; byRule: number; unclassified: number; failure?: AppFailure }

const CATEGORY: Record<string, Category> = {
  directPersonal: 'direct_personal',
  workRequest: 'work_request',
  meetingCalendar: 'meeting_calendar',
  financeBilling: 'finance_billing',
  notificationAutomated: 'notification_automated',
  newsletterMarketing: 'newsletter_marketing',
  social: 'social',
  securityAccount: 'security_account',
  other: 'other',
}
const URGENCY: Record<string, Urgency> = { urgent: 'urgent', notUrgent: 'not_urgent' }
const IMPORTANCE: Record<string, Importance> = { high: 'high', medium: 'medium', low: 'low' }

type Router = Pick<ReturnType<typeof aiRouter>, 'complete'>
type Item = {
  id: string
  accountId: string
  message: ReturnType<typeof rowToMailMessage>
  sentAt: Date
  vip: boolean
  correction: Importance | null
}
type Outcome = { classified: number; unclassified: number; failure?: AppFailure }
const add = (a: Outcome, b: Outcome): Outcome => ({
  classified: a.classified + b.classified,
  unclassified: a.unclassified + b.unclassified,
  failure: a.failure ?? b.failure,
})

const cut = (v: unknown, max: number) => {
  const s = (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max) : s
}

export type TriageDeps = {
  db: Db
  router: Router
  batchSize?: number
  now?: () => Date
  /** Called with ids only after results are stored. */
  onDone?: (userId: string, count: number) => void
}

/**
 * Classifies new mail. Only messages the pre-filter answers with
 * `send_to_ai` are turned into a prompt; labelled and excluded messages never
 * reach the router. A VIP sender's importance is at least High, and a user's
 * correction for a sender always wins over the model.
 */
export function triageService(d: TriageDeps) {
  const now = d.now ?? (() => new Date())
  const batchSize = d.batchSize ?? 8

  const context = (userId: string) => buildUserContext(d.db, userId, now())

  async function triagePending(userId: string, o: { limit?: number; useAi?: boolean } = {}) {
    return triageMessages(userId, await forUser(d.db, userId).triage.untriaged(o.limit ?? 100), o)
  }

  async function triageMessages(
    userId: string,
    ids: string[],
    o: { useAi?: boolean } = {},
  ): Promise<TriageRun> {
    const repos = forUser(d.db, userId)
    const settings = await repos.settings.all()
    const builder = new PromptBuilder(builderOptions(settings))
    const todo: Item[] = []
    let byRule = 0
    const accountCache = new Map<
      string,
      { excluded: boolean; rules: Awaited<ReturnType<typeof repos.rules.effective>> }
    >()

    for (const id of await repos.triage.untriagedAmong(ids)) {
      const row = await repos.mail.getMessage(id)
      if (!row) continue
      let acc = accountCache.get(row.accountId)
      if (!acc) {
        const a = await repos.accounts.get(row.accountId)
        accountCache.set(
          row.accountId,
          (acc = {
            excluded: a?.aiExcluded ?? false,
            rules: await repos.rules.effective(row.accountId),
          }),
        )
      }
      const message = rowToMailMessage(row)
      const decision = preFilter(message, {
        rules: acc.rules.filter((r) => r.kind !== 'correction'),
        accountAiExcluded: acc.excluded,
        aiForNewsletters: settings['ai.processBulk'],
      })
      if (decision.action === 'excluded') {
        await storeRule(userId, id, 'other', 'low', 'not_urgent', AI_EXCLUDED_REASON)
        byRule++
      } else if (decision.action === 'labeled') {
        await storeRule(
          userId,
          id,
          decision.category,
          decision.importance,
          decision.urgency,
          decision.reason,
        )
        byRule++
      } else {
        todo.push({
          id,
          accountId: row.accountId,
          message,
          sentAt: row.sentAt,
          vip: decision.vip,
          correction: await repos.rules.correctionFor(row.fromAddress),
        })
      }
    }
    if (!todo.length || o.useAi === false) {
      if (byRule) d.onDone?.(userId, byRule)
      return { byAi: 0, byRule, unclassified: 0 }
    }

    const ctx = await context(userId)
    let total: Outcome = { classified: 0, unclassified: 0 }
    for (let i = 0; i < todo.length && !total.failure; i += batchSize)
      total = add(total, await runBatch(userId, builder, todo.slice(i, i + batchSize), ctx, true))
    d.onDone?.(userId, byRule + total.classified + total.unclassified)
    return {
      byAi: total.classified,
      byRule,
      unclassified: total.unclassified,
      ...(total.failure ? { failure: total.failure } : {}),
    }
  }

  async function runBatch(
    userId: string,
    builder: PromptBuilder,
    batch: Item[],
    ctx: UserContext,
    allowSplit: boolean,
  ): Promise<Outcome> {
    const prompt = builder.buildTriage(
      batch.map((b) => ({ messageId: b.id, message: b.message })),
      ctx,
    )
    let provenance: { providerId: string; model: string } | null = null
    const baseTokens = 250 * batch.length + 200
    const call: Caller = async (turn) => {
      const task = turn.kind === 'repair' ? 'repair' : 'triage'
      const r = await d.router.complete(userId, task, () => ({
        system: triagePrompt.system,
        user:
          turn.kind === 'repair'
            ? repairUserMessage(prompt.text, turn.invalid, turn.prompt)
            : prompt.text,
        maxTokens: turn.kind === 'retry_longer' ? Math.min(baseTokens * 2, 16_000) : baseTokens,
        schema: triagePrompt.schema,
      }))
      if (!r.ok) return r
      provenance ??= { providerId: r.value.route.providerId, model: r.value.route.model }
      return ok<Attempt>({ text: r.value.text, stop: r.value.stop })
    }
    const r = await structuredCall(call, triagePrompt.schema!.schema)

    if (!r.ok) {
      const e = r.error
      if (e.kind === 'ai_output' && e.problem !== 'refusal' && allowSplit && batch.length > 1) {
        // Truncated or malformed: smaller batches are easier to answer.
        const mid = Math.floor(batch.length / 2)
        let out: Outcome = { classified: 0, unclassified: 0 }
        for (const part of [batch.slice(0, mid), batch.slice(mid)]) {
          out = add(out, await runBatch(userId, builder, part, ctx, true))
          if (out.failure) break
        }
        return out
      }
      if (e.kind === 'ai_output' && batch.length === 1) {
        await storeUnclassified(userId, batch[0]!)
        return { classified: 0, unclassified: 1 }
      }
      return { classified: 0, unclassified: 0, failure: e }
    }

    const results = ((r.value as { results?: Record<string, unknown>[] }).results ?? []) as (Record<
      string,
      unknown
    > & { id: string })[]
    const { kept } = reconcileIds(results, Object.keys(prompt.idMap)) // invented and repeated ids are dropped
    const byId = new Map(batch.map((b) => [b.id, b]))
    const handled = new Set<string>()
    let classified = 0
    for (const entry of kept) {
      const item = byId.get(prompt.idMap[entry.id]!)!
      if (await storeAi(userId, item, entry, provenance)) {
        handled.add(item.id)
        classified++
      }
    }
    let out: Outcome = { classified, unclassified: 0 }
    const missing = batch.filter((b) => !handled.has(b.id))
    if (!missing.length) return out
    if (batch.length === 1) {
      await storeUnclassified(userId, missing[0]!)
      return add(out, { classified: 0, unclassified: 1 })
    }
    for (const item of missing) {
      out = add(out, await runBatch(userId, builder, [item], ctx, false)) // once alone, then give up
      if (out.failure) break
    }
    return out
  }

  async function storeAi(
    userId: string,
    item: Item,
    e: Record<string, unknown>,
    prov: { providerId: string; model: string } | null,
  ): Promise<boolean> {
    const category = CATEGORY[String(e.category)]
    const modelImportance = IMPORTANCE[String(e.importance)]
    const urgency = URGENCY[String(e.urgency)]
    if (!category || !modelImportance || !urgency) return false
    let importance = modelImportance
    if (item.vip && importance !== 'high') importance = 'high'
    importance = item.correction ?? importance // the user's correction wins (BR-04)
    const conf = typeof e.confidence === 'number' ? Math.min(Math.max(e.confidence, 0), 1) : null

    const tz = (await context(userId)).offsetAt
    const resolver = dueDateResolver({ offsetAt: tz })
    const actions = (
      Array.isArray(e.actionItems) ? (e.actionItems as Record<string, unknown>[]) : []
    )
      .slice(0, 10)
      .flatMap((a) => {
        const text = cut(a.text, 200)
        if (!text) return []
        const due = resolver.resolve({
          emailDate: item.sentAt,
          isoDate: typeof a.dueDate === 'string' ? a.dueDate : null,
          phrase: typeof a.dueText === 'string' ? a.dueText : null,
        })
        return [{ itemText: text, dueAt: due.at, dueText: due.text }]
      })
    await forUser(d.db, userId).triage.save(
      {
        messageId: item.id,
        category,
        importance,
        urgency,
        priority: priorityOf(importance, urgency),
        needsReply: e.needsReply === true,
        summary: cut(e.summary, 220),
        reason: cut(e.reason, 100),
        confidence: conf,
        source: 'ai',
        providerId: prov?.providerId ?? null,
        model: prov?.model ?? null,
        promptVersion: PROMPT_VERSIONS.triage,
      },
      actions,
    )
    return true
  }

  const storeRule = (
    userId: string,
    messageId: string,
    category: Category,
    importance: Importance,
    urgency: Urgency,
    reason: string,
  ) =>
    forUser(d.db, userId).triage.save(
      {
        messageId,
        category,
        importance,
        urgency,
        priority: priorityOf(importance, urgency),
        needsReply: false,
        summary: '',
        reason,
        source: 'rule',
      },
      [],
    )

  const storeUnclassified = (userId: string, item: Item) =>
    storeRule(
      userId,
      item.id,
      'other',
      item.correction ?? (item.vip ? 'high' : 'medium'),
      'not_urgent',
      UNCLASSIFIED_REASON,
    )

  return { triagePending, triageMessages }
}

export type TriageService = ReturnType<typeof triageService>
