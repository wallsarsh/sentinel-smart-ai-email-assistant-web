export type Segment = { text: string; mark: boolean }

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m)

/**
 * Splits a server headline (HTML-escaped, with <mark> around matches) into
 * plain-text segments, so it can be rendered without v-html.
 */
export function parseHeadline(headline: string): Segment[] {
  return headline.split(/(<mark>|<\/mark>)/).reduce<{ out: Segment[]; mark: boolean }>(
    (acc, part) => {
      if (part === '<mark>') acc.mark = true
      else if (part === '</mark>') acc.mark = false
      else if (part) acc.out.push({ text: decode(part), mark: acc.mark })
      return acc
    },
    { out: [], mark: false },
  ).out
}

const KEY = 'sentinel.recentSearches'
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** Recent queries kept in this browser only (never sent anywhere). Storage errors are ignored. */
export function recentSearches(storage: StorageLike | null, max = 8) {
  const read = (): string[] => {
    try {
      const v = JSON.parse(storage?.getItem(KEY) ?? '[]')
      return Array.isArray(v)
        ? v.filter((x): x is string => typeof x === 'string').slice(0, max)
        : []
    } catch {
      return []
    }
  }
  return {
    list: read,
    add(q: string) {
      const t = q.trim()
      if (t.length < 2) return read()
      const next = [t, ...read().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, max)
      try {
        storage?.setItem(KEY, JSON.stringify(next))
      } catch {
        /* private mode: just don't remember */
      }
      return next
    },
    clear() {
      try {
        storage?.setItem(KEY, '[]')
      } catch {
        /* ignore */
      }
    },
  }
}
