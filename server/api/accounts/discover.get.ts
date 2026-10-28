import { discover } from '../../mail/imap/autodiscovery'
import { failWith } from '../../utils/respond'
import { requireUser } from '../../utils/require-user'

/** Suggested IMAP/SMTP settings for an address; reads public config only. */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const email = String(getQuery(event).email ?? '')
  const found = await discover(email)
  if (!found) return failWith(event, { kind: 'validation', field: 'email', code: 'invalid' })
  return found
})
