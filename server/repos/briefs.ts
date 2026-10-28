import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { actionItems, briefItems, dailyBriefs, messages, triageResults } from '../db/schema'
import type { BriefSectionType } from '../../shared/brief'
import type { Scope } from './scope'

const SECTION_DB = {
  topPriorities: 'top_priorities',
  needsReply: 'needs_reply',
  dueToday: 'due_today',
  fyi: 'fyi',
} as const
const SECTION_APP = Object.fromEntries(
  Object.entries(SECTION_DB).map(([k, v]) => [v, k]),
) as Record<string, BriefSectionType>

export type StoredBriefRow = typeof dailyBriefs.$inferSelect
export type NewBrief = {
  id: string
  windowStart: Date
  windowEnd: Date
  headline: string
  stats: Record<string, number>
  providerId: string | null
  model: string | null
  createdAt: Date
  items: { section: BriefSectionType; text: string; messageIds: string[] }[]
}

/** Stored daily briefs and the inputs the brief generator reads (triaged mail, open actions). */
export const briefsRepo = (s: Scope) => {
  const triaged = () =>
    s.db
      .select({
        id: messages.id,
        accountId: messages.accountId,
        fromAddress: messages.fromAddress,
        fromName: messages.fromName,
        receivedAt: messages.receivedAt,
        priority: triageResults.priority,
        category: triageResults.category,
        needsReply: triageResults.needsReply,
        summary: triageResults.summary,
      })
      .from(messages)
      .innerJoin(triageResults, eq(triageResults.messageId, messages.id))
  const own = eq(messages.userId, s.userId)
  return {
    triagedBetween: (start: Date, end: Date, limit = 2000) =>
      triaged()
        .where(and(own, gte(messages.receivedAt, start), lte(messages.receivedAt, end)))
        .orderBy(desc(messages.receivedAt))
        .limit(limit),

    triagedByIds: (ids: string[]) =>
      ids.length ? triaged().where(and(own, inArray(messages.id, ids))) : Promise.resolve([]),

    /** Open (not done, not snoozed into the future) action items; with [dueBefore], only those due by then. */
    async openActions(dueBefore?: Date, now = new Date()) {
      const rows = await s.db
        .select({
          messageId: actionItems.messageId,
          text: actionItems.itemText,
          dueAt: actionItems.dueAt,
          status: actionItems.status,
          snoozedUntil: actionItems.snoozedUntil,
        })
        .from(actionItems)
        .where(and(eq(actionItems.userId, s.userId), eq(actionItems.status, 'open')))
      return rows.filter(
        (a) =>
          (!a.snoozedUntil || a.snoozedUntil <= now) &&
          (!dueBefore || (a.dueAt !== null && a.dueAt < dueBefore)),
      )
    },

    /** Subject and sender of the user's own messages, for the links of a brief item. */
    heads: (ids: string[]) =>
      ids.length
        ? s.db
            .select({
              id: messages.id,
              subject: messages.subject,
              sender: messages.fromName,
              address: messages.fromAddress,
            })
            .from(messages)
            .where(and(eq(messages.userId, s.userId), inArray(messages.id, ids)))
        : Promise.resolve([]),

    async save(b: NewBrief) {
      await s.db.transaction(async (tx) => {
        await tx.insert(dailyBriefs).values({
          id: b.id,
          userId: s.userId,
          windowStart: b.windowStart,
          windowEnd: b.windowEnd,
          headline: b.headline,
          statsJson: b.stats,
          providerId: b.providerId,
          model: b.model,
          createdAt: b.createdAt,
        })
        if (b.items.length)
          await tx.insert(briefItems).values(
            b.items.map((it, position) => ({
              userId: s.userId,
              briefId: b.id,
              section: SECTION_DB[it.section],
              itemText: it.text,
              messageIdsJson: it.messageIds,
              position,
            })),
          )
      })
    },

    async latest(): Promise<{
      row: StoredBriefRow
      items: (typeof briefItems.$inferSelect)[]
    } | null> {
      const [row] = await s.db
        .select()
        .from(dailyBriefs)
        .where(eq(dailyBriefs.userId, s.userId))
        .orderBy(desc(dailyBriefs.createdAt))
        .limit(1)
      return row ? { row, items: await itemsOf(row.id) } : null
    },

    async get(id: string) {
      const [row] = await s.db
        .select()
        .from(dailyBriefs)
        .where(and(eq(dailyBriefs.userId, s.userId), eq(dailyBriefs.id, id)))
      return row ? { row, items: await itemsOf(row.id) } : null
    },

    history: (limit = 30) =>
      s.db
        .select()
        .from(dailyBriefs)
        .where(eq(dailyBriefs.userId, s.userId))
        .orderBy(desc(dailyBriefs.createdAt))
        .limit(limit),

    async createdSince(since: Date): Promise<number> {
      return (
        await s.db
          .select({ id: dailyBriefs.id })
          .from(dailyBriefs)
          .where(and(eq(dailyBriefs.userId, s.userId), gte(dailyBriefs.createdAt, since)))
      ).length
    },

    async deleteBefore(before: Date) {
      return (
        await s.db
          .delete(dailyBriefs)
          .where(and(eq(dailyBriefs.userId, s.userId), lte(dailyBriefs.createdAt, before)))
          .returning({ id: dailyBriefs.id })
      ).length
    },
  }

  async function itemsOf(briefId: string) {
    return s.db
      .select()
      .from(briefItems)
      .where(and(eq(briefItems.userId, s.userId), eq(briefItems.briefId, briefId)))
      .orderBy(briefItems.position)
  }
}

export const sectionFromDb = (v: string): BriefSectionType => SECTION_APP[v] ?? 'fyi'
