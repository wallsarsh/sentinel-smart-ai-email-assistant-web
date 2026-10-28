import { randomUUID } from 'node:crypto'
import type { Db } from '../db/client'
import { buildUserContext } from '../ai/user-context'
import { PromptBuilder, type BriefEmail } from '../ai/prompts/builder'
import { briefPrompt } from '../ai/prompts/registry'
import { structuredCall, type Attempt, type Caller } from '../ai/structured'
import type { aiRouter } from '../ai/router'
import { forUser } from '../repos'
import { ruleMatches } from '../triage/prefilter'
import {
  BRIEF_SECTIONS,
  type BriefSection,
  type BriefStats,
  type DailyBrief,
} from '../../shared/brief'
import type { AppFailure } from '../../shared/errors/failure'
import { err, ok, type Result } from '../../shared/errors/result'

export type BriefDeps = {
  db: Db
  router: Pick<ReturnType<typeof aiRouter>, 'complete'>
  now?: () => Date
  newId?: () => string
  maxEmails?: number
  maxItemsPerSection?: number
}

const clip = (s: string, max: number) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`
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

    if (!emails.size) return ok(await store(userId, start, end, '', [], stats, null, null, persist))

    ranked.sort((a, b) => a.rank - b.rank || b.at.getTime() - a.at.getTime())
    const chosen = ranked.slice(0, maxEmails).map((r) => emails.get(r.id)!)
    const prompt = new PromptBuilder().buildBrief(chosen, ctx, {
      windowStart: start,
      windowEnd: end,
      stats: { ...stats },
    })

    let provenance: { providerId: string; model: string } | null = null
    const call: Caller = async (turn) => {
      const r = await d.router.complete(
        userId,
        turn.kind === 'repair' ? 'repair' : 'brief',
        () => ({
          system: briefPrompt.system,
          user:
            turn.kind === 'repair'
              ? `${prompt.text}\n\n<previous_output>\n${turn.invalid}\n</previous_output>\n${turn.prompt}`
              : prompt.text,
          maxTokens: turn.kind === 'retry_longer' ? 4000 : 2000,
          schema: briefPrompt.schema,
        }),
      )
      if (!r.ok) return r
      provenance ??= { providerId: r.value.route.providerId, model: r.value.route.model }
      return ok<Attempt>({ text: r.value.text, stop: r.value.stop })
    }
    const res = await structuredCall(call, briefPrompt.schema!.schema)
    if (!res.ok) return res

    const parsed = res.value as {
      headline: string
      sections: { type: string; items: { text: string; emailIds: string[] }[] }[]
    }
    const byType = new Map<string, { text: string; messageIds: string[] }[]>()
    const seen = new Set<string>()
    for (const sec of parsed.sections) {
      if (!(BRIEF_SECTIONS as readonly string[]).includes(sec.type)) continue
      for (const item of sec.items) {
        const valid: string[] = []
        for (const id of item.emailIds) {
          const local = prompt.idMap[id]
          if (local && !valid.includes(local)) valid.push(local)
        }
        const text = clip(item.text, 160)
        if (!valid.length || !text || seen.has(text)) continue
        seen.add(text)
        const list = byType.get(sec.type) ?? []
        if (list.length < maxItems) list.push({ text, messageIds: valid })
        byType.set(sec.type, list)
      }
    }
    const sections: BriefSection[] = BRIEF_SECTIONS.filter((t) => byType.get(t)?.length).map(
      (type) => ({ type, items: byType.get(type)! }),
    )
    const headline = clip(parsed.headline, 400)
    if (!headline && !sections.length) return err({ kind: 'ai_output', problem: 'empty' })
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
