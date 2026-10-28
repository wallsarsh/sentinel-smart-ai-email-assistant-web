import { sql } from 'drizzle-orm'
import type { Scope } from './scope'

/** Same expression as the migration's index; keep them identical. */
const DOC = sql.raw(
  `to_tsvector('simple', coalesce(m.subject, '') || ' ' || coalesce(m.from_address, '') || ' ' || coalesce(m.from_name, '') || ' ' || coalesce(m.body_text, ''))`,
)

/**
 * Turns user input into a prefix tsquery: words only (letters and digits from
 * any script), each as a prefix, AND-ed. Returns null when nothing searchable
 * is left. Raw input never reaches to_tsquery, so operators and quotes are inert.
 */
export function toTsQuery(input: string): string | null {
  const words = input
    .normalize('NFKC')
    .match(/[\p{L}\p{N}]+/gu)
    ?.slice(0, 8)
  return words?.length ? words.map((w) => `${w.slice(0, 40)}:*`).join(' & ') : null
}

export type SearchHit = {
  id: string
  accountId: string
  subject: string
  fromAddress: string
  fromName: string | null
  receivedAt: Date
  isRead: boolean
  /** Snippet with matches wrapped in <mark>…</mark>; text is HTML-escaped. */
  headline: string
}

export const searchRepo = (s: Scope) => ({
  async search(q: {
    text: string
    accountId?: string
    unreadOnly?: boolean
    limit?: number
    offset?: number
  }): Promise<SearchHit[]> {
    const tsq = toTsQuery(q.text)
    if (!tsq) return []
    const limit = Math.min(Math.max(q.limit ?? 20, 1), 50)
    const r = await s.db.execute(sql`
      select m.id, m.account_id, m.subject, m.from_address, m.from_name, m.received_at, m.is_read,
             ts_headline('simple', coalesce(nullif(m.body_text, ''), m.subject), to_tsquery('simple', ${tsq}),
               'StartSel=<mark>, StopSel=</mark>, MaxWords=24, MinWords=8, MaxFragments=1') as headline
      from messages m
      join folders f on f.id = m.folder_id and f.processed
      where m.user_id = ${s.userId}
        and ${DOC} @@ to_tsquery('simple', ${tsq})
        ${q.accountId ? sql`and m.account_id = ${q.accountId}` : sql``}
        ${q.unreadOnly ? sql`and not m.is_read` : sql``}
      order by m.received_at desc, m.id desc
      limit ${limit} offset ${Math.max(q.offset ?? 0, 0)}`)
    return r.rows.map((x) => ({
      id: String(x.id),
      accountId: String(x.account_id),
      subject: String(x.subject),
      fromAddress: String(x.from_address),
      fromName: x.from_name === null ? null : String(x.from_name),
      receivedAt: new Date(String(x.received_at)),
      isRead: Boolean(x.is_read),
      headline: escapeExceptMarks(String(x.headline)),
    }))
  },
})

/** ts_headline returns raw text around our <mark> tags; escape everything but those. */
export function escapeExceptMarks(s: string): string {
  return s
    .split(/(<\/?mark>)/)
    .map((p, i) =>
      i % 2
        ? p
        : p
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'),
    )
    .join('')
}
