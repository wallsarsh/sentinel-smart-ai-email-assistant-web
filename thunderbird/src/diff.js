// Word-level diff used by the proofread/rewrite review. Pure and bounded for large selections.
const LIMIT = 1200

export function tokenize(text) {
  return String(text ?? '').match(/\s+|[^\s]+/g) ?? []
}

function fallback(before, after) {
  return {
    ops: [
      ...(before ? [{ type: 'delete', text: before, group: 0 }] : []),
      ...(after ? [{ type: 'insert', text: after, group: 0 }] : []),
    ],
    hunks: [{ id: 0, before, after }],
  }
}

/**
 * Returns {ops, hunks}. Equal ops have group null; changed runs share a hunk id.
 * A text with no changes returns an empty hunks list.
 */
export function diffWords(before, after) {
  const a = tokenize(before)
  const b = tokenize(after)
  if (a.join('') === b.join('')) return { ops: a.map((text) => ({ type: 'equal', text, group: null })), hunks: [] }
  if (a.length > LIMIT || b.length > LIMIT) return fallback(before, after)

  const rows = a.length + 1
  const cols = b.length + 1
  const table = Array.from({ length: rows }, () => new Uint16Array(cols))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])

  const raw = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      raw.push({ type: 'equal', text: a[i] })
      i++
      j++
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      raw.push({ type: 'delete', text: a[i] })
      i++
    } else {
      raw.push({ type: 'insert', text: b[j] })
      j++
    }
  }
  while (i < a.length) raw.push({ type: 'delete', text: a[i++] })
  while (j < b.length) raw.push({ type: 'insert', text: b[j++] })

  const ops = []
  const hunks = []
  let current = null
  for (const op of raw) {
    if (op.type === 'equal') {
      if (current) {
        hunks.push(current)
        current = null
      }
      ops.push({ ...op, group: null })
      continue
    }
    if (!current) current = { id: hunks.length, before: '', after: '' }
    if (op.type === 'delete') current.before += op.text
    else current.after += op.text
    ops.push({ ...op, group: current.id })
  }
  if (current) hunks.push(current)
  return { ops, hunks }
}

/** Rebuilds the text using decisions: hunk ids in accepted use the suggestion; others keep the original. */
export function renderDecisions(ops, accepted) {
  let out = ''
  for (const op of ops) {
    if (op.type === 'equal') out += op.text
    else if (accepted.has(op.group)) {
      if (op.type === 'insert') out += op.text
    } else if (op.type === 'delete') out += op.text
  }
  return out
}
