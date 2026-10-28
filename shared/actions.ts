export type ActionRow = {
  id: string
  messageId: string
  text: string
  dueAt: Date | null
  dueText: string | null
  status: 'open' | 'done' | 'snoozed'
  snoozedUntil: Date | null
  subject: string
  fromName: string | null
  fromAddress: string
}

export type ActionGroups = {
  today: ActionRow[]
  upcoming: ActionRow[]
  noDate: ActionRow[]
  snoozed: ActionRow[]
  done: ActionRow[]
}

/** Local calendar day number (days since epoch) of an instant for a zone offset in minutes. */
const dayOf = (d: Date, offsetMin: number) =>
  Math.floor((d.getTime() + offsetMin * 60_000) / 86_400_000)

/**
 * Today = due today or overdue; upcoming = due later; no date = no deadline
 * (a phrase the resolver could not turn into a date counts as no date). Snoozed
 * items are hidden until their time passes, then they return like open ones.
 */
export function groupActions(
  rows: ActionRow[],
  now: Date,
  offsetAt: (d: Date) => number,
): ActionGroups {
  const g: ActionGroups = { today: [], upcoming: [], noDate: [], snoozed: [], done: [] }
  const today = dayOf(now, offsetAt(now))
  for (const r of rows) {
    if (r.status === 'done') g.done.push(r)
    else if (r.status === 'snoozed' && r.snoozedUntil && r.snoozedUntil > now) g.snoozed.push(r)
    else if (!r.dueAt) g.noDate.push(r)
    else if (dayOf(r.dueAt, offsetAt(r.dueAt)) <= today) g.today.push(r)
    else g.upcoming.push(r)
  }
  const byDue = (a: ActionRow, b: ActionRow) =>
    (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0)
  g.today.sort(byDue)
  g.upcoming.sort(byDue)
  return g
}

/** 08:00 local time on the next calendar day. */
export function tomorrowMorning(now: Date, offsetAt: (d: Date) => number): Date {
  const next = dayOf(now, offsetAt(now)) + 1
  const guess = new Date(next * 86_400_000 + 8 * 3_600_000 - offsetAt(now) * 60_000)
  return new Date(next * 86_400_000 + 8 * 3_600_000 - offsetAt(guess) * 60_000)
}
