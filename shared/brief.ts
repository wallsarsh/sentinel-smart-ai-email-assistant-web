export const BRIEF_SECTIONS = ['topPriorities', 'needsReply', 'dueToday', 'fyi'] as const
export type BriefSectionType = (typeof BRIEF_SECTIONS)[number]

export type BriefItem = { text: string; messageIds: string[] }
export type BriefSection = { type: BriefSectionType; items: BriefItem[] }
export type BriefStats = {
  total: number
  needsReply: number
  p1: number
  p2: number
  newsletters: number
  notifications: number
}

export type DailyBrief = {
  id: string | null
  windowStart: string
  windowEnd: string
  headline: string
  sections: BriefSection[]
  stats: BriefStats
  createdAt: string
  model: string | null
}

/**
 * The range a new brief covers: the last 24 hours, or since the previous
 * brief ended when that is older (at most a week back).
 */
export function briefWindow(now: Date, previousEnd: Date | null): { start: Date; end: Date } {
  const end = now
  let start = new Date(end.getTime() - 24 * 3_600_000)
  if (previousEnd && previousEnd < start) {
    const week = new Date(end.getTime() - 7 * 86_400_000)
    start = previousEnd < week ? week : previousEnd
  }
  return { start, end }
}
