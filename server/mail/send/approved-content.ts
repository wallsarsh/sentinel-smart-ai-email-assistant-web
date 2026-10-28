import { createHash } from 'node:crypto'
import type { EmailAddress } from '../../../shared/domain'

/**
 * Exactly what the user saw on the confirmation screen. The send gate binds an
 * authorization to a hash of this, so what is sent is what was confirmed.
 */
export type ApprovedContent = {
  accountId: string
  from: EmailAddress
  to: EmailAddress[]
  cc: EmailAddress[]
  subject: string
  /** Final body including signature, as displayed. */
  bodyText: string
  /** Message-ID of the message being replied to. */
  inReplyToInternetMessageId: string
  /** The draft saved at the provider that will be updated and submitted. */
  draftRef: { providerDraftId: string; providerMessageId: string | null }
}

const addresses = (list: EmailAddress[]) =>
  [...new Set(list.map((a) => a.address.trim().toLowerCase()))].sort()

/**
 * SHA-256 (hex) over a canonical encoding of the sendable content. Recipient
 * order and address case do not matter; every other character of subject and
 * body does. The draft pointer is not part of the hash.
 */
export function contentHash(c: ApprovedContent): string {
  const canonical = JSON.stringify([
    c.accountId,
    c.from.address.trim().toLowerCase(),
    addresses(c.to),
    addresses(c.cc),
    c.subject,
    c.bodyText,
    c.inReplyToInternetMessageId,
  ])
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/** Matches `[some text]` (2 to 60 characters, single line). */
export const PLACEHOLDER_PATTERN = /\[[^\]\n]{2,60}\]/g

export const unresolvedPlaceholders = (c: Pick<ApprovedContent, 'bodyText'>) =>
  [...c.bodyText.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[0])
