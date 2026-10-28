/**
 * Tidies model output into a reply body: removes code fences, a leading
 * "Subject:" line and anything after a "-- " signature delimiter (the app adds
 * the user's signature itself).
 */
export function cleanDraft(raw: string): string {
  let t = raw.replace(/\r\n/g, '\n').trim()
  const fence = /^```[a-z]*\n([\s\S]*?)\n?```$/i.exec(t)
  if (fence) t = fence[1]!.trim()
  t = t.replace(/^(?:subject|betreff|objet|asunto)\s*:.*\n+/i, '')
  const sig = t.search(/\n-- ?\n/)
  if (sig >= 0) t = t.slice(0, sig)
  return t.replace(/\n{3,}/g, '\n\n').trim()
}

export { placeholders, scanForeignDetails, type ForeignDetail } from '../../shared/draft-scan'
