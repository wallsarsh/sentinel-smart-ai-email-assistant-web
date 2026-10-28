import type { BriefSection, BriefStats, DailyBrief } from '../../shared/brief'
import { sectionFromDb, type StoredBriefRow } from '../repos/briefs'

type ItemRow = { section: string; itemText: string; messageIdsJson: unknown }

/** A stored brief as the API returns it. */
export function toDailyBrief(row: StoredBriefRow, items: ItemRow[]): DailyBrief {
  const sections: BriefSection[] = []
  for (const it of items) {
    const type = sectionFromDb(it.section)
    let s = sections.find((x) => x.type === type)
    if (!s) sections.push((s = { type, items: [] }))
    s.items.push({
      text: it.itemText,
      messageIds: Array.isArray(it.messageIdsJson) ? (it.messageIdsJson as string[]) : [],
    })
  }
  return {
    id: row.id,
    windowStart: row.windowStart.toISOString(),
    windowEnd: row.windowEnd.toISOString(),
    headline: row.headline,
    sections,
    stats: {
      total: 0,
      needsReply: 0,
      p1: 0,
      p2: 0,
      newsletters: 0,
      notifications: 0,
      ...(row.statsJson as Partial<BriefStats>),
    },
    createdAt: row.createdAt.toISOString(),
    model: row.model,
  }
}
