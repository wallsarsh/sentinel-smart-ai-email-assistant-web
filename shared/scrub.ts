const rules: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[jwt]'],
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [token]'],
  [/\b(?:sk|xai|gsk|pk)[-_][A-Za-z0-9_-]{16,}/g, '[api-key]'],
  [/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/g, '[token]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/(?:password|passwd|secret|token|api[_-]?key)(["'\s:=]+)[^\s"',;&]{3,}/gi, '[redacted]'],
  [/[A-Za-z0-9+/_-]{60,}={0,2}/g, '[blob]'],
]

/** Removes addresses, tokens, keys and long encoded strings from free text. */
export function scrub(text: string): string {
  let out = text
  for (const [re, rep] of rules) out = out.replace(re, rep)
  return out
}
