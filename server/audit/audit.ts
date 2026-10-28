import type { Db } from '../db/client'
import { forUser } from '../repos'

/** Events we record. Detail strings hold ids and codes only, never content. */
export type AuditEvent =
  | 'signup'
  | 'login_success'
  | 'login_failed'
  | 'login_locked'
  | 'logout'
  | 'password_reset_requested'
  | 'password_changed'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'mfa_failed'
  | 'recovery_codes_regenerated'
  | 'step_up'
  | 'account_connected'
  | 'account_removed'
  | 'send_authorized'
  | 'send_completed'
  | 'data_exported'
  | 'account_deleted'
  | 'session_revoked'

export const AUDIT_EVENTS: readonly AuditEvent[] = [
  'signup',
  'login_success',
  'login_failed',
  'login_locked',
  'logout',
  'password_reset_requested',
  'password_changed',
  'mfa_enabled',
  'mfa_disabled',
  'mfa_failed',
  'recovery_codes_regenerated',
  'step_up',
  'account_connected',
  'account_removed',
  'send_authorized',
  'send_completed',
  'data_exported',
  'account_deleted',
  'session_revoked',
]

export type Auditor = {
  record(userId: string, event: AuditEvent, detail?: string, ip?: string): Promise<void>
}

export const auditorFor = (db: Db, now: () => Date = () => new Date()): Auditor => ({
  async record(userId, event, detail = '', ip = '') {
    // Defensive: audit text is for ids and codes; long free text is truncated.
    await forUser(db, userId).audit.add(event, detail.slice(0, 120), ip.slice(0, 64), now())
  },
})

/** Progressive lockout: 5 failures 1 min, 10 failures 5 min, 15+ 30 min. */
export function lockDuration(failures: number): number {
  if (failures >= 15) return 30 * 60_000
  if (failures >= 10) return 5 * 60_000
  if (failures >= 5) return 60_000
  return 0
}
