export type NativeLink = { kind: 'link'; url: string } | { kind: 'manual' }

/**
 * Where to open a saved draft in the provider's own web mail. Gmail and
 * Outlook have stable web URLs; IMAP accounts have none, so the user is told
 * to open the Drafts folder in their mail app instead. Only https URLs are
 * ever produced.
 */
export function nativeDraftLink(
  accountType: 'gmail' | 'microsoft_graph' | 'imap',
  o: { providerDraftId: string | null; accountEmail?: string },
): NativeLink {
  if (!o.providerDraftId) return { kind: 'manual' }
  const id = encodeURIComponent(o.providerDraftId)
  let url: string | null = null
  if (accountType === 'gmail')
    url = `https://mail.google.com/mail/${o.accountEmail ? `?authuser=${encodeURIComponent(o.accountEmail)}` : ''}#drafts?compose=${id}`
  else if (accountType === 'microsoft_graph')
    url = `https://outlook.office.com/mail/deeplink/compose/${id}`
  return url && isHttps(url) ? { kind: 'link', url } : { kind: 'manual' }
}

export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
