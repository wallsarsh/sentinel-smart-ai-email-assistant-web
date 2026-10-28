import { useDb } from '../../../container'
import { replyRecipients, replySubject } from '../../../mail/mime/reply-builder'
import { forUser } from '../../../repos'
import { rowToMailMessage } from '../../../sync/message-mapper'
import { failWith } from '../../../utils/respond'
import { requireUser } from '../../../utils/require-user'

/** Recipients and subject for a reply and a reply-all, computed from the thread (never adds people who were not on it). */
export default defineEventHandler(async (event) => {
  const { user } = await requireUser(event)
  const repos = forUser(useDb(), user.id)
  const row = await repos.mail.getMessage(getRouterParam(event, 'id') ?? '')
  if (!row) return failWith(event, { kind: 'not_found' })
  const selfAddresses = new Set((await repos.accounts.list()).map((a) => a.email))
  const original = rowToMailMessage(row)
  const reply = replyRecipients({ original, selfAddresses, mode: 'reply' })
  const replyAll = replyRecipients({ original, selfAddresses, mode: 'reply_all' })
  const account = await repos.accounts.get(row.accountId)
  return {
    accountId: row.accountId,
    accountEmail: account?.email ?? '',
    aiExcluded: account?.aiExcluded ?? false,
    subject: replySubject(original.subject),
    reply,
    replyAll,
    signature: (await repos.settings.get('profile.signature')) as string,
  }
})
