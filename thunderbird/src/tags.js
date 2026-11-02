// Best-effort Thunderbird tags. The analysis cache is the source of truth; tags are a convenience.
export const TAG_PREFIX = 'Sentinel '
export const TAG_DEFS = {
  p1: { name: 'Sentinel P1', color: '#C62828' },
  p2: { name: 'Sentinel P2', color: '#EF6C00' },
  p3: { name: 'Sentinel P3', color: '#1565C0' },
  p4: { name: 'Sentinel P4', color: '#616161' },
  reply: { name: 'Sentinel Reply', color: '#2E7D32' },
  ignored: { name: 'Sentinel Ignored', color: '#757575' },
}

/** Stable, valid Thunderbird tag key for a human-readable Sentinel tag name. */
export const tagKeyFor = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const priorityTag = (priority) =>
  priority === 'p1_do_now'
    ? TAG_DEFS.p1
    : priority === 'p2_today'
      ? TAG_DEFS.p2
      : priority === 'p3_this_week'
        ? TAG_DEFS.p3
        : TAG_DEFS.p4

/** Tags that describe this analysis: one priority, plus reply/ignored when relevant. */
export function tagNamesFor(analysis) {
  if (!analysis) return []
  const out = [priorityTag(analysis.priority).name]
  if (analysis.skipped && analysis.intent === 'other') out.push(TAG_DEFS.ignored.name)
  else if (analysis.needsReply && !analysis.skipped) out.push(TAG_DEFS.reply.name)
  return out
}

/** Keeps the user's own tags, drops old Sentinel tags, adds the current ones. */
export function mergeTagKeys(existing = [], keys = [], allSentinelKeys = []) {
  const sentinel = new Set(allSentinelKeys)
  return [...new Set([...existing.filter((k) => !sentinel.has(k)), ...keys])]
}

/**
 * Resolves tag names to Thunderbird keys, creates missing tags when possible,
 * then updates the message. Returns the known map and a warning rather than throwing.
 */
export async function applyTags({ api, header, analysis, known = {} }) {
  if (!api?.list || !api?.update) return { known, warning: 'Tagging is not available.' }
  const names = tagNamesFor(analysis)
  if (!names.length) return { known }
  const map = { ...known }
  try {
    const list = await api.list()
    for (const t of list) map[t.tag] = t.key
    for (const name of names) {
      if (map[name]) continue
      const def = Object.values(TAG_DEFS).find((d) => d.name === name)
      if (!api.create || !def) continue
      const key = tagKeyFor(name)
      try {
        await api.create(key, def.name, def.color)
        map[name] = key
      } catch {
        // Another worker may have created it, or this build cannot create tags.
      }
    }
    const ready = names.map((n) => map[n]).filter(Boolean)
    if (!ready.length) return { known: map, warning: 'Sentinel tags are not available.' }
    const allSentinel = Object.keys(map).filter((n) => n.startsWith(TAG_PREFIX))
    const next = mergeTagKeys(
      header.tags ?? [],
      ready,
      allSentinel.map((n) => map[n]),
    )
    await api.update(header.id, { tags: next })
    return { known: map }
  } catch {
    return { known: map, warning: 'The message could not be tagged.' }
  }
}
