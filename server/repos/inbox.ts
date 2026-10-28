import { and, desc, eq, exists, lt, or, sql, type SQL } from 'drizzle-orm'
import { actionItems, folders, messages, triageResults } from '../db/schema'
import type { Scope } from './scope'

export const SEGMENTS = [
  'all',
  'needs_reply',
  'actions',
  'important',
  'fyi',
  'newsletters',
] as const
export type Segment = (typeof SEGMENTS)[number]

export type InboxQuery = {
  segment: Segment
  accountId?: string
  /** Opaque cursor from the previous page. */
  cursor?: string
  limit?: number
}

const enc = (d: Date, id: string) => Buffer.from(`${d.toISOString()}|${id}`).toString('base64url')
function dec(c: string): { at: Date; id: string } | null {
  const [iso, id] = Buffer.from(c, 'base64url').toString('utf8').split('|')
  const at = new Date(iso ?? '')
  return id && !Number.isNaN(at.getTime()) ? { at, id } : null
}

export const inboxRepo = (s: Scope) => {
  /** Messages in folders the user chose to process, optionally one account, in a segment. */
  const base = (segment: Segment, accountId?: string): SQL => {
    const parts: (SQL | undefined)[] = [
      eq(messages.userId, s.userId),
      exists(
        s.db
          .select({ one: sql`1` })
          .from(folders)
          .where(and(eq(folders.id, messages.folderId), eq(folders.processed, true))),
      ),
      accountId ? eq(messages.accountId, accountId) : undefined,
    ]
    const t = (c: SQL) =>
      exists(
        s.db
          .select({ one: sql`1` })
          .from(triageResults)
          .where(and(eq(triageResults.messageId, messages.id), c)),
      )
    switch (segment) {
      case 'needs_reply':
        parts.push(t(eq(triageResults.needsReply, true)))
        break
      case 'actions':
        parts.push(
          exists(
            s.db
              .select({ one: sql`1` })
              .from(actionItems)
              .where(and(eq(actionItems.messageId, messages.id), eq(actionItems.status, 'open'))),
          ),
        )
        break
      case 'important':
        parts.push(t(eq(triageResults.importance, 'high')))
        break
      case 'fyi':
        parts.push(t(eq(triageResults.priority, 'p4_fyi')))
        break
      case 'newsletters':
        parts.push(
          t(
            or(
              eq(triageResults.category, 'newsletter_marketing'),
              eq(triageResults.category, 'notification_automated'),
            )!,
          ),
        )
        break
    }
    return and(...parts.filter((p): p is SQL => !!p))!
  }

  return {
    /** All segment counts in one pass over the user's messages (one query, not one per segment). */
    async counts(accountId?: string): Promise<Record<Segment, number>> {
      return (await this.countsWithUnread(accountId)).counts
    },

    /** Segment counts and the unread total from one query. */
    async countsWithUnread(
      accountId?: string,
    ): Promise<{ counts: Record<Segment, number>; unread: number }> {
      const r = await s.db.execute(sql`
        select count(*)::int as "all",
               (count(*) filter (where t.needs_reply))::int as needs_reply,
               (count(*) filter (where a.message_id is not null))::int as actions,
               (count(*) filter (where t.importance = 'high'))::int as important,
               (count(*) filter (where t.priority = 'p4_fyi'))::int as fyi,
               (count(*) filter (where not m.is_read))::int as unread,
               (count(*) filter (where t.category in ('newsletter_marketing', 'notification_automated')))::int as newsletters
        from messages m
        join folders f on f.id = m.folder_id and f.processed
        left join triage_results t on t.message_id = m.id
        left join (select distinct message_id from action_items
                   where user_id = ${s.userId} and status = 'open') a on a.message_id = m.id
        where m.user_id = ${s.userId}
          ${accountId ? sql`and m.account_id = ${accountId}` : sql``}`)
      const row = (r.rows[0] ?? {}) as Record<Segment | 'unread', number | undefined>
      return {
        counts: Object.fromEntries(SEGMENTS.map((seg) => [seg, row[seg] ?? 0])) as Record<
          Segment,
          number
        >,
        unread: row.unread ?? 0,
      }
    },

    async unreadCount(accountId?: string): Promise<number> {
      const [r] = await s.db
        .select({ n: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(base('all', accountId), eq(messages.isRead, false)))
      return r?.n ?? 0
    },

    async list(q: InboxQuery) {
      const limit = Math.min(Math.max(q.limit ?? 30, 1), 100)
      const c = q.cursor ? dec(q.cursor) : null
      if (q.cursor && !c) throw new Error('bad_cursor')
      const where = and(
        base(q.segment, q.accountId),
        c
          ? or(
              lt(messages.receivedAt, c.at),
              and(eq(messages.receivedAt, c.at), lt(messages.id, c.id)),
            )
          : undefined,
      )
      const rows = await s.db
        .select({
          id: messages.id,
          accountId: messages.accountId,
          fromAddress: messages.fromAddress,
          fromName: messages.fromName,
          subject: messages.subject,
          snippet: messages.snippet,
          receivedAt: messages.receivedAt,
          isRead: messages.isRead,
          threadId: messages.threadId,
          priority: triageResults.priority,
          category: triageResults.category,
          needsReply: triageResults.needsReply,
          summary: triageResults.summary,
        })
        .from(messages)
        .leftJoin(triageResults, eq(triageResults.messageId, messages.id))
        .where(where)
        .orderBy(desc(messages.receivedAt), desc(messages.id))
        .limit(limit + 1)
      const page = rows.slice(0, limit)
      const last = page.at(-1)
      return {
        items: page,
        nextCursor: rows.length > limit && last ? enc(last.receivedAt, last.id) : null,
      }
    },
  }
}
