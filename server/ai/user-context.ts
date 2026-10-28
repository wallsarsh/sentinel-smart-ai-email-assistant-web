import type { Db } from '../db/client'
import { forUser } from '../repos'
import { authRepo } from '../repos/auth'
import { zoneOffset, type UserContext } from './prompts/builder'

const validZone = (tz: string) => {
  try {
    zoneOffset(tz, new Date())
    return tz
  } catch {
    return 'UTC'
  }
}

/**
 * What the model may know about the user, from their profile, accounts and
 * sender rules. The only place a UserContext is assembled, so profile changes
 * reach every prompt (triage, drafts, brief).
 */
export async function buildUserContext(db: Db, userId: string, now: Date): Promise<UserContext> {
  const repos = forUser(db, userId)
  const [user, s, accounts, rules, hints] = await Promise.all([
    authRepo(db).userById(userId),
    repos.settings.all(),
    repos.accounts.list(),
    repos.rules.list(),
    repos.rules.hints(),
  ])
  const tz = validZone(user?.timezone || 'UTC')
  return {
    name: user?.displayName ?? '',
    role: s['profile.role'] || undefined,
    timezoneName: tz,
    offsetAt: (t) => zoneOffset(tz, t),
    now,
    selfAddresses: new Set(accounts.map((a) => a.email)),
    vipSenders: rules
      .filter((r) => r.rule === 'vip')
      .map((r) => r.pattern)
      .slice(0, 50),
    senderHints: hints,
    signOff: s['profile.signOff'] || undefined,
    styleNotes: s['profile.styleNotes'] || undefined,
    language: s['profile.language'] || undefined,
  }
}
