import type { RecoveryAction } from './failure-presenter'

/** Where a failure's recovery button leads from the brief pages; null means "try again". */
export function briefActionTarget(a: RecoveryAction): string | null {
  switch (a) {
    case 'open_ai_settings':
      return '/settings/ai'
    case 'open_accounts':
    case 'reconnect':
      return '/settings/accounts'
    case 'sign_in':
      return '/login'
    default:
      return null
  }
}
