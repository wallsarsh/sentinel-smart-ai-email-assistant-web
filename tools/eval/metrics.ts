/** Scoring for the AI evaluation (BRD BO-2): the same metrics and targets as the mobile harness. */
export type Importance = 'high' | 'medium' | 'low'
export const LEVELS: Importance[] = ['high', 'medium', 'low']

export type Expectation = { importance: Importance; needsReply: boolean; actions: string[] }
export type Prediction = {
  schemaValid: boolean
  importance?: string | null
  needsReply?: boolean | null
  actions?: string[]
}

export type Report = {
  cases: number
  needsReplyPrecision: number
  needsReplyRecall: number
  importanceMacroF1: number
  actionRecall: number
  schemaValidRate: number
}

export const TARGETS: Record<keyof Omit<Report, 'cases'>, number> = {
  needsReplyPrecision: 0.85,
  needsReplyRecall: 0.8,
  importanceMacroF1: 0.75,
  actionRecall: 0.8,
  schemaValidRate: 0.99,
}

const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d)
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])

/** A predicted action matches an expected one when at least half of the expected one's words appear in it. */
export function actionMatches(expected: string, predicted: string): boolean {
  const e = words(expected)
  if (!e.size) return false
  const p = words(predicted)
  let shared = 0
  for (const w of e) if (p.has(w)) shared++
  return shared * 2 >= e.size
}

/** Scores [predictions] against [expected] (same order and length). */
export function scoreEvaluation(expected: Expectation[], predictions: Prediction[]): Report {
  if (expected.length !== predictions.length) throw new Error('one prediction per case')
  let tp = 0
  let fp = 0
  let fn = 0
  let valid = 0
  let actionsExpected = 0
  let actionsFound = 0
  const f = Object.fromEntries(LEVELS.map((l) => [l, [0, 0, 0]])) as Record<Importance, number[]>
  expected.forEach((e, i) => {
    const p = predictions[i]!
    if (p.schemaValid) valid++
    const predictedReply = p.schemaValid && p.needsReply === true
    if (e.needsReply && predictedReply) tp++
    else if (!e.needsReply && predictedReply) fp++
    else if (e.needsReply && !predictedReply) fn++
    for (const l of LEVELS) {
      const isExpected = e.importance === l
      const isPredicted = p.schemaValid && p.importance === l
      if (isExpected && isPredicted) f[l][0]!++
      else if (!isExpected && isPredicted) f[l][1]!++
      else if (isExpected && !isPredicted) f[l][2]!++
    }
    for (const a of e.actions) {
      actionsExpected++
      if (p.schemaValid && (p.actions ?? []).some((x) => actionMatches(a, x))) actionsFound++
    }
  })
  const f1 = (c: number[]) => {
    const precision = ratio(c[0]!, c[0]! + c[1]!)
    const recall = ratio(c[0]!, c[0]! + c[2]!)
    return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  }
  return {
    cases: expected.length,
    needsReplyPrecision: ratio(tp, tp + fp),
    needsReplyRecall: ratio(tp, tp + fn),
    importanceMacroF1: LEVELS.map((l) => f1(f[l])).reduce((a, b) => a + b, 0) / LEVELS.length,
    actionRecall: ratio(actionsFound, actionsExpected),
    schemaValidRate: ratio(valid, expected.length),
  }
}

/** Names of the metrics below their target; [schemaTarget] is 0.95 for providers without strict structured output. */
export function misses(r: Report, schemaTarget = TARGETS.schemaValidRate): string[] {
  return (Object.keys(TARGETS) as (keyof typeof TARGETS)[]).filter(
    (k) => r[k] < (k === 'schemaValidRate' ? schemaTarget : TARGETS[k]),
  )
}
