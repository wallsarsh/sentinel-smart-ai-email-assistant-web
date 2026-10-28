import type { Db } from '../../server/db/client'
import { zoneOffset } from '../../server/ai/prompts/builder'
import type { BriefGenerator } from '../../server/brief/generator'
import type { Deadline } from '../../server/jobs/deadline'
import type { Notifier } from '../../server/push/rules'
import { forUser } from '../../server/repos'
import { authRepo } from '../../server/repos/auth'
import { briefWindow } from '../../shared/brief'
import { isBriefDue, localDate } from '../../shared/brief-schedule'

export type BriefPorts = {
  /** Background AI is allowed. */
  aiEnabled(userId: string): Promise<boolean>
  /** The brief time has passed in the user's zone and no brief was written since. */
  isDue(userId: string, now: Date): Promise<boolean>
  /** Claims today's slot so two workers never write two briefs; false when taken. */
  claim(userId: string, now: Date): Promise<boolean>
  /** Gives the slot back after a failure so the next run can retry. */
  release(userId: string, now: Date): Promise<void>
  /** Writes and stores a brief; the id, or null on failure. */
  generate(userId: string, now: Date): Promise<string | null>
  /** Tells the user the brief is ready (opt-in). */
  notifyReady(userId: string, briefId: string): Promise<void>
}

/** Least time worth starting a brief with. */
export const MIN_BRIEF_MS = 10_000

/**
 * Writes the daily brief when it is due, there is time, and background AI is
 * allowed. The mail check calls this after its other work, and the brief is
 * also written when the user opens the app and none exists (generate on open).
 * Returns true when a brief was written.
 */
export function briefStep(ports: BriefPorts, now: () => Date = () => new Date()) {
  return async (userId: string, deadline: Deadline): Promise<boolean> => {
    if (!deadline.canStart(MIN_BRIEF_MS)) return false
    const at = now()
    if (!(await ports.aiEnabled(userId)) || !(await ports.isDue(userId, at))) return false
    if (!(await ports.claim(userId, at))) return false
    let id: string | null = null
    try {
      id = await ports.generate(userId, at)
    } finally {
      if (!id) await ports.release(userId, at)
    }
    if (!id) return false
    await ports.notifyReady(userId, id).catch(() => undefined) // the brief is written either way
    return true
  }
}

async function zoneOf(db: Db, userId: string) {
  const tz = (await authRepo(db).userById(userId))?.timezone || 'UTC'
  try {
    zoneOffset(tz, new Date())
    return tz
  } catch {
    return 'UTC'
  }
}

/** The real ports. */
export function defaultBriefPorts(d: {
  db: Db
  brief: Pick<BriefGenerator, 'generate'>
  push?: Notifier
}): BriefPorts {
  const repos = (u: string) => forUser(d.db, u)
  const offsetFor = async (u: string) => {
    const tz = await zoneOf(d.db, u)
    return (at: Date) => zoneOffset(tz, at)
  }
  const key = async (u: string, now: Date) => `brief:${localDate(now, await offsetFor(u))}`
  return {
    aiEnabled: async (u) => (await repos(u).settings.get('bg.aiEnabled')) as boolean,
    async isDue(u, now) {
      const r = repos(u)
      if (!(await r.accounts.list()).some((a) => a.status === 'active')) return false
      return isBriefDue({
        now,
        minutes: (await r.settings.get('brief.minutes')) as number,
        lastCreatedAt: (await r.briefs.latest())?.row.createdAt ?? null,
        offsetAt: await offsetFor(u),
      })
    },
    claim: async (u, now) => repos(u).background.claimNotification(await key(u, now)),
    release: async (u, now) => repos(u).background.releaseNotification(await key(u, now)),
    async generate(u, now) {
      const w = briefWindow(now, (await repos(u).briefs.latest())?.row.windowEnd ?? null)
      const r = await d.brief.generate(u, w.start, w.end)
      return r.ok ? r.value.id : null
    },
    async notifyReady(u, briefId) {
      if (!d.push || !((await repos(u).settings.get('brief.notify')) as boolean)) return
      await d.push.send(u, { type: 'brief', briefId })
    },
  }
}
