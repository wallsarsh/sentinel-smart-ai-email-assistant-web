import { randomUUID } from 'node:crypto'
import type { Db } from '../db/client'
import { buildUserContext } from '../ai/user-context'
import { builderOptions } from '../ai/prompts/from-settings'
import { PromptBuilder, type BriefEmail } from '../ai/prompts/builder'
import { runBrief } from '../../packages/core/src/brief'
import type { Attempt } from '../ai/structured'
import type { aiRouter } from '../ai/router'
import { forUser } from '../repos'
import { ruleMatches } from '../triage/prefilter'
import type { BriefSection, BriefStats, DailyBrief } from '../../shared/brief'
import type { AppFailure } from '../../shared/errors/failure'
import { err, ok, type Result } from '../../shared/errors/result'

export type BriefDeps = {
  db: Db
  router: Pick<ReturnType<typeof aiRouter>, 'complete'>
  now?: () => Date
  newId?: () => string
  /** Sorts mail that has not been triaged yet, so a brief never says "nothing new" only because that step has not run. */
  triage?: {
    triagePending(userId: string, o?: { limit?: number }): Promise<{ failure?: AppFailure }>
  }
  maxEmails?: number
  maxItemsPerSection?: number
}

const LABEL = { p1_do_now: 'P1', p2_today: 'P2', p3_this_week: 'P3', p4_fyi: 'P4' } as const

/**
 * Builds the daily brief from stored triage summaries. The model sees
 * summaries (with short throwaway ids), never full mail and never database
 * ids. Counts come from the database. Every id the model returns is checked
 * against the ids that were sent: unknown ids are dropped, and an item with no
 * valid id left is dropped too, so each item links to real mail.
 */
export function briefGenerator(d: BriefDeps) {
  const now = d.now ?? (() => new Date())
  const newId = d.newId ?? randomUUID
  const maxEmails = d.maxEmails ?? 200
  const maxItems = d.maxItemsPerSection ?? 5

  async function run(
    userId: string,
    start: Date,
    end: Date,
    persist: boolean,
  ): Promise<Result<DailyBrief, AppFailure>> {
    const repos = forUser(d.db, userId)
    let triageFailure: AppFailure | undefined
    if (d.triage) {
      try {
        triageFailure = (await d.triage.triagePending(userId, { limit: 50 })).failure
      } catch {
        // the brief still covers what is already sorted
      }
    }
    const ctx = await buildUserContext(d.db, userId, now())
    const triaged = await repos.briefs.triagedBetween(start, end)
    const stats: BriefStats = {
      total: triaged.length,
      needsReply: triaged.filter((t) => t.needsReply).length,
      p1: triaged.filter((t) => t.priority === 'p1_do_now').length,
      p2: triaged.filter((t) => t.priority === 'p2_today').length,
      newsletters: triaged.filter((t) => t.category === 'newsletter_marketing').length,
      notifications: triaged.filter((t) => t.category === 'notification_automated').length,
    }

    // Open actions due by the end of the user's today.
    const off = ctx.offsetAt(ctx.now) * 60_000
    const local = new Date(ctx.now.getTime() + off)
    const endOfToday = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - off,
    )
    const due = await repos.briefs.openActions(endOfToday, ctx.now)
    const openAll = await repos.briefs.openActions(undefined, ctx.now)
    const actionsBy = new Map<string, string[]>()
    for (const a of openAll) {
      const text = a.dueAt ? `${a.text} (due ${a.dueAt.toISOString().slice(0, 10)})` : a.text
      actionsBy.set(a.messageId, [...(actionsBy.get(a.messageId) ?? []), text])
    }

    const vips = (await repos.rules.list())
      .filter((r) => r.rule === 'vip')
      .map((r) => ({ pattern: r.pattern, kind: 'vip' as const }))
    const emails = new Map<string, BriefEmail>()
    const ranked: { rank: number; at: Date; id: string }[] = []
    type Row = (typeof triaged)[number]
    const add = (m: Row, rank: number) => {
      if (emails.has(m.id)) return
      emails.set(m.id, {
        messageId: m.id,
        sender: m.fromName?.trim() || m.fromAddress,
        priority: LABEL[m.priority],
        summary: m.summary,
        isVip: vips.some((v) => ruleMatches(v, m.fromAddress)),
        needsReply: m.needsReply,
        actions: actionsBy.get(m.id) ?? [],
      })
      ranked.push({ rank, at: m.receivedAt, id: m.id })
    }
    for (const m of triaged) {
      const bulk = m.category === 'newsletter_marketing' || m.category === 'notification_automated'
      const rank =
        m.priority === 'p1_do_now'
          ? 0
          : m.priority === 'p2_today'
            ? 1
            : m.needsReply
              ? 2
              : m.priority === 'p3_this_week'
                ? 3
                : bulk
                  ? 9
                  : 4
      if (rank !== 9) add(m, rank)
    }
    const dueIds = [...new Set(due.map((a) => a.messageId))].filter((id) => !emails.has(id))
    for (const m of await repos.briefs.triagedByIds(dueIds)) add(m, 1)

    // Nothing could be sorted because the AI is not set up or failed: say so instead of "nothing new".
    if (!emails.size && triageFailure && !stats.total) return err(triageFailure)
    if (!emails.size) return ok(await store(userId, start, end, '', [], stats, null, null, persist))

    ranked.sort((a, b) => a.rank - b.rank || b.at.getTime() - a.at.getTime())
    const chosen = ranked.slice(0, maxEmails).map((r) => emails.get(r.id)!)
    let provenance: { providerId: string; model: string } | null = null
    const res = await runBrief({
      emails: chosen,
      ctx,
      window: { start, end },
      stats: { ...stats },
      builder: new PromptBuilder(builderOptions(await repos.settings.all())),
      maxItems,
      ask: async (req, kind) => {
        const r = await d.router.complete(userId, kind, () => req)
        if (!r.ok) return r
        provenance ??= { providerId: r.value.route.providerId, model: r.value.route.model }
        return ok<Attempt>({ text: r.value.text, stop: r.value.stop })
      },
    })
    if (!res.ok) return res
    const { headline, sections } = res.value
    const p = provenance as { providerId: string; model: string } | null
    return ok(
      await store(
        userId,
        start,
        end,
        headline,
        sections,
        stats,
        p?.providerId ?? null,
        p?.model ?? null,
        persist,
      ),
    )
  }

  async function store(
    userId: string,
    start: Date,
    end: Date,
    headline: string,
    sections: BriefSection[],
    stats: BriefStats,
    providerId: string | null,
    model: string | null,
    persist: boolean,
  ): Promise<DailyBrief> {
    const createdAt = now()
    const id = persist ? newId() : null
    if (id)
      await forUser(d.db, userId).briefs.save({
        id,
        windowStart: start,
        windowEnd: end,
        headline,
        stats: { ...stats },
        providerId,
        model,
        createdAt,
        items: sections.flatMap((s) => s.items.map((i) => ({ section: s.type, ...i }))),
      })
    return {
      id,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      headline,
      sections,
      stats,
      createdAt: createdAt.toISOString(),
      model,
    }
  }

  return {
    /** Generates and stores the brief for [start, end]. */
    generate: (userId: string, start: Date, end: Date) => run(userId, start, end, true),
    /** "Catch me up": shown but never stored, so it cannot replace the daily brief or fill the history. */
    catchUp: (userId: string, start: Date, end: Date) => run(userId, start, end, false),
  }
}
export type BriefGenerator = ReturnType<typeof briefGenerator>
